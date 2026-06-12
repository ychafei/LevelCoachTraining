import { Client, Databases, ID, Permission, Query, Role, Users } from 'node-appwrite';
import Stripe from 'stripe';

const DB_ID = process.env.APPWRITE_DATABASE_ID || 'lctraining';
const STRIPE_API_VERSION = process.env.STRIPE_API_VERSION || '2026-02-25.clover';

function services() {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://nyc.cloud.appwrite.io/v1')
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);
  return { databases: new Databases(client), users: new Users(client) };
}

function body(req) {
  if (req.bodyJson && typeof req.bodyJson === 'object') return req.bodyJson;
  try { return JSON.parse(req.bodyRaw || req.body || '{}'); } catch { return {}; }
}

function header(req, names) {
  for (const name of names) {
    const value = req.headers?.[name] || req.headers?.[name.toLowerCase()] || req.headers?.[name.toUpperCase()];
    if (value) return String(value);
  }
  return '';
}

function callerAccountId(req) {
  return header(req, ['x-appwrite-user-id', 'X-Appwrite-User-Id', 'X-Appwrite-User-ID']);
}

async function profileForAccount(databases, accountId) {
  const rows = await databases.listDocuments(DB_ID, 'profiles', [
    Query.equal('account_id', accountId),
    Query.limit(1),
  ]);
  return rows.documents[0] || null;
}

// Banned users cannot manage Connect accounts.
async function callerBanned(databases, profile) {
  if (!profile?.email) return false;
  const rows = await databases.listDocuments(DB_ID, 'user_bans', [
    Query.equal('banned_email', profile.email),
    Query.equal('is_active', true),
    Query.limit(1),
  ]).catch(() => ({ documents: [] }));
  return rows.documents.length > 0;
}

// Admin authority via Users API account labels — never profile.role.
async function isPlatformAdmin(users, accountId) {
  try {
    const account = await users.get(accountId);
    const labels = Array.isArray(account.labels) ? account.labels : [];
    return labels.includes('admin') || labels.includes('superadmin');
  } catch {
    return false;
  }
}

// Caller must own the coach (coaches.user_id === caller account) or be an
// org owner/admin via organization_members. Platform admins may also manage.
async function canManageOwner(databases, users, accountId, profile, ownerType, ownerId) {
  if (ownerType === 'coach') {
    const coach = await databases.getDocument(DB_ID, 'coaches', ownerId).catch(() => null);
    if (coach && coach.user_id && coach.user_id === accountId) return true;
    return isPlatformAdmin(users, accountId);
  }
  if (ownerType === 'org') {
    if (profile) {
      const rows = await databases.listDocuments(DB_ID, 'organization_members', [
        Query.equal('organization_id', ownerId),
        Query.equal('profile_id', profile.$id),
        Query.equal('status', 'active'),
        Query.limit(5),
      ]).catch(() => ({ documents: [] }));
      if (rows.documents.some((row) => row.role === 'org_owner' || row.role === 'org_admin')) return true;
    }
    return isPlatformAdmin(users, accountId);
  }
  return false;
}

async function findConnectedAccount(databases, ownerType, ownerId, stripeAccountId = '') {
  if (stripeAccountId) {
    const rows = await databases.listDocuments(DB_ID, 'stripe_connected_accounts', [
      Query.equal('stripe_account_id', stripeAccountId),
      Query.limit(1),
    ]);
    return rows.documents[0] || null;
  }
  const rows = await databases.listDocuments(DB_ID, 'stripe_connected_accounts', [
    Query.equal('owner_type', ownerType),
    Query.equal('owner_id', ownerId),
    Query.limit(1),
  ]);
  return rows.documents[0] || null;
}

// Per-document read grants for the account owner(s): the coach account, or the
// org's owner/admin member accounts.
async function ownerReadAccountIds(databases, ownerType, ownerId, accountId) {
  const ids = new Set();
  if (ownerType === 'coach') {
    const coach = await databases.getDocument(DB_ID, 'coaches', ownerId).catch(() => null);
    if (coach?.user_id) ids.add(coach.user_id);
  } else {
    const members = await databases.listDocuments(DB_ID, 'organization_members', [
      Query.equal('organization_id', ownerId),
      Query.equal('status', 'active'),
      Query.limit(50),
    ]).catch(() => ({ documents: [] }));
    const admins = members.documents
      .filter((member) => member.role === 'org_owner' || member.role === 'org_admin')
      .slice(0, 10);
    for (const member of admins) {
      const profile = await databases.getDocument(DB_ID, 'profiles', member.profile_id).catch(() => null);
      if (profile?.account_id) ids.add(profile.account_id);
    }
    if (accountId) ids.add(accountId);
  }
  return [...ids];
}

// Owner email is resolved server-side; client-supplied emails are not trusted.
async function ownerEmail(databases, ownerType, ownerId, profile) {
  if (ownerType === 'coach') {
    const coach = await databases.getDocument(DB_ID, 'coaches', ownerId).catch(() => null);
    return coach?.email || '';
  }
  const org = await databases.getDocument(DB_ID, 'organizations', ownerId).catch(() => null);
  return org?.contact_email || profile?.email || '';
}

// Derived rollup of the Stripe flags, stored for UI/state checks:
//   incomplete — onboarding not finished (details not submitted)
//   in_review  — submitted; Stripe is verifying, nothing currently due
//   restricted — submitted but blocked with action required from the owner
//   active     — charges and payouts both enabled
function onboardingStatus(account) {
  if (account.charges_enabled && account.payouts_enabled) return 'active';
  if (!account.details_submitted) return 'incomplete';
  const due = account.requirements?.currently_due || [];
  return due.length > 0 || account.requirements?.disabled_reason ? 'restricted' : 'in_review';
}

function syncFields(account) {
  return {
    charges_enabled: !!account.charges_enabled,
    payouts_enabled: !!account.payouts_enabled,
    details_submitted: !!account.details_submitted,
    requirements_due: JSON.stringify(account.requirements?.currently_due || []),
    disabled_reason: account.requirements?.disabled_reason || '',
    onboarding_status: onboardingStatus(account),
    last_synced_at: new Date().toISOString(),
  };
}

// Rollout-safe write: if the live schema predates onboarding_status (the
// provision script has not run yet), retry without it instead of failing.
async function writeAccountDoc(write, data) {
  try {
    return await write(data);
  } catch (err) {
    if (/unknown attribute/i.test(err?.message || '') && 'onboarding_status' in data) {
      const rest = { ...data };
      delete rest.onboarding_status;
      return write(rest);
    }
    throw err;
  }
}

async function syncOwnerAccountId(databases, ownerType, ownerId, stripeAccountId) {
  const collection = ownerType === 'coach' ? 'coaches' : 'organizations';
  await databases.updateDocument(DB_ID, collection, ownerId, { stripe_account_id: stripeAccountId }).catch(() => {});
}

async function createAccount({ databases, users, stripe, accountId, profile, ownerType, ownerId }) {
  // Idempotent: one connected account per owner.
  const existing = await findConnectedAccount(databases, ownerType, ownerId);
  if (existing?.stripe_account_id) {
    return {
      account_id: existing.stripe_account_id,
      record_id: existing.$id,
      charges_enabled: !!existing.charges_enabled,
      payouts_enabled: !!existing.payouts_enabled,
      details_submitted: !!existing.details_submitted,
      already_exists: true,
    };
  }

  const account = await stripe.accounts.create({
    country: 'US',
    email: await ownerEmail(databases, ownerType, ownerId, profile) || undefined,
    business_type: ownerType === 'org' ? 'company' : 'individual',
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    controller: {
      fees: { payer: 'application' },
      losses: { payments: 'application' },
      stripe_dashboard: { type: 'express' },
    },
    metadata: { owner_type: ownerType, owner_id: ownerId },
  });

  const readIds = await ownerReadAccountIds(databases, ownerType, ownerId, accountId);
  const permissions = readIds.map((id) => Permission.read(Role.user(id)));
  const data = {
    owner_type: ownerType,
    owner_id: ownerId,
    stripe_account_id: account.id,
    account_mode: 'controller_express',
    ...syncFields(account),
  };
  let row;
  try {
    row = await writeAccountDoc(
      (doc) => databases.createDocument(DB_ID, 'stripe_connected_accounts', ID.unique(), doc, permissions),
      data,
    );
  } catch (err) {
    if (err?.code === 409) {
      // A concurrent createAccount won the unique (owner_type, owner_id) race.
      // Their account is canonical: discard the one we just created and return
      // the existing record.
      await stripe.accounts.del(account.id).catch(() => {});
      const existing = await findConnectedAccount(databases, ownerType, ownerId);
      if (existing) {
        return {
          account_id: existing.stripe_account_id,
          record_id: existing.$id,
          charges_enabled: !!existing.charges_enabled,
          payouts_enabled: !!existing.payouts_enabled,
          details_submitted: !!existing.details_submitted,
          already_exists: true,
        };
      }
      throw err;
    }
    row = await writeAccountDoc(
      (doc) => databases.createDocument(DB_ID, 'stripe_connected_accounts', ID.unique(), doc),
      data,
    );
  }
  await syncOwnerAccountId(databases, ownerType, ownerId, account.id);

  return {
    account_id: account.id,
    record_id: row.$id,
    charges_enabled: row.charges_enabled,
    payouts_enabled: row.payouts_enabled,
    details_submitted: row.details_submitted,
  };
}

async function onboardingLink({ databases, stripe, ownerType, ownerId }) {
  const record = await findConnectedAccount(databases, ownerType, ownerId);
  if (!record?.stripe_account_id) return { status: 404, error: 'No Stripe connected account exists for this owner.' };

  // APP_BASE_URL is required in production — no localhost fallback.
  const base = String(process.env.APP_BASE_URL || '').trim().replace(/\/$/, '');
  if (!base) return { status: 500, error: 'Service configuration error.', log: 'APP_BASE_URL is not configured.' };

  // Org returns land on the revenue tab, where the Connect card lives.
  const path = ownerType === 'org' ? '/organization?tab=revenue' : '/coach/earnings';
  const sep = path.includes('?') ? '&' : '?';
  const link = await stripe.accountLinks.create({
    account: record.stripe_account_id,
    refresh_url: `${base}${path}${sep}stripe_refresh=1`,
    return_url: `${base}${path}${sep}stripe_return=1`,
    type: 'account_onboarding',
  });
  return { url: link.url };
}

async function refresh({ databases, stripe, ownerType, ownerId, stripeAccountId }) {
  const record = await findConnectedAccount(databases, ownerType, ownerId, stripeAccountId);
  if (!record?.stripe_account_id) return { status: 404, error: 'Stripe connected account record not found.' };

  const account = await stripe.accounts.retrieve(record.stripe_account_id);
  const updated = await writeAccountDoc(
    (doc) => databases.updateDocument(DB_ID, 'stripe_connected_accounts', record.$id, doc),
    syncFields(account),
  );
  await syncOwnerAccountId(databases, record.owner_type, record.owner_id, record.stripe_account_id);
  return {
    record_id: updated.$id,
    stripe_account_id: updated.stripe_account_id,
    charges_enabled: updated.charges_enabled,
    payouts_enabled: updated.payouts_enabled,
    details_submitted: updated.details_submitted,
    requirements_due: updated.requirements_due,
    disabled_reason: updated.disabled_reason,
    onboarding_status: updated.onboarding_status || onboardingStatus(account),
  };
}

async function dashboardLink({ databases, stripe, ownerType, ownerId }) {
  const record = await findConnectedAccount(databases, ownerType, ownerId);
  if (!record?.stripe_account_id) return { status: 404, error: 'No Stripe connected account exists for this owner.' };
  const link = await stripe.accounts.createLoginLink(record.stripe_account_id);
  return { url: link.url };
}

export default async ({ req, res, error }) => {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      error?.('[stripeConnect] STRIPE_SECRET_KEY is not configured.');
      return res.json({ error: 'Service configuration error.' }, 500);
    }
    const accountId = callerAccountId(req);
    if (!accountId) return res.json({ error: 'Authentication required.' }, 401);

    const payload = body(req);
    const action = String(payload.action || '');
    if (!['createAccount', 'onboardingLink', 'refresh', 'dashboardLink'].includes(action)) {
      return res.json({ error: 'Unknown action.' }, 400);
    }

    const ownerType = payload.owner_type === 'org' ? 'org' : 'coach';
    const ownerId = payload.owner_id;
    const stripeAccountId = typeof payload.stripe_account_id === 'string' ? payload.stripe_account_id.slice(0, 128) : '';
    if (typeof ownerId !== 'string' || !/^[A-Za-z0-9._-]{1,64}$/.test(ownerId)) {
      if (!(action === 'refresh' && stripeAccountId)) {
        return res.json({ error: 'owner_id is required.' }, 400);
      }
    }

    const { databases, users } = services();
    const profile = await profileForAccount(databases, accountId).catch(() => null);
    if (await callerBanned(databases, profile)) {
      return res.json({ error: 'Account access is restricted.' }, 403);
    }

    // refresh may locate the record by stripe_account_id; authorize against
    // the record's actual owner in that case.
    let authOwnerType = ownerType;
    let authOwnerId = ownerId;
    if (action === 'refresh' && stripeAccountId) {
      const record = await findConnectedAccount(databases, ownerType, ownerId || '', stripeAccountId);
      if (!record) return res.json({ error: 'Stripe connected account record not found.' }, 404);
      authOwnerType = record.owner_type;
      authOwnerId = record.owner_id;
    }
    if (!(await canManageOwner(databases, users, accountId, profile, authOwnerType, authOwnerId))) {
      return res.json({ error: 'You do not have access to this Stripe account owner.' }, 403);
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: STRIPE_API_VERSION });
    const context = { databases, users, stripe, accountId, profile, ownerType: authOwnerType, ownerId: authOwnerId, stripeAccountId };

    let result;
    if (action === 'createAccount') result = await createAccount(context);
    else if (action === 'onboardingLink') result = await onboardingLink(context);
    else if (action === 'refresh') result = await refresh(context);
    else result = await dashboardLink(context);

    if (result?.status) {
      if (result.log) error?.(`[stripeConnect] ${result.log}`);
      return res.json({ error: result.error }, result.status);
    }
    return res.json(result);
  } catch (err) {
    error?.(`[stripeConnect] ${err?.message || err}`);
    return res.json({ error: 'Could not complete Stripe Connect request.' }, 500);
  }
};
