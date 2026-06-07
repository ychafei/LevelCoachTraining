import { Client, Databases, Query } from 'node-appwrite';
import Stripe from 'stripe';

const DB_ID = process.env.APPWRITE_DATABASE_ID || 'levelcoach';
const STRIPE_API_VERSION = process.env.STRIPE_API_VERSION || '2026-02-25.clover';

function db() {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://nyc.cloud.appwrite.io/v1')
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);
  return new Databases(client);
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

function isAdmin(profile) {
  return profile?.role === 'admin' || profile?.role === 'super_admin';
}

async function canManageOwner(databases, profile, ownerType, ownerId) {
  if (isAdmin(profile)) return true;
  if (ownerType === 'coach') return profile?.coach_id === ownerId;
  if (ownerType === 'org') {
    if (profile?.primary_organization_id === ownerId) return true;
    const rows = await databases.listDocuments(DB_ID, 'organization_members', [
      Query.equal('organization_id', ownerId),
      Query.equal('profile_id', profile.$id),
      Query.equal('status', 'active'),
      Query.limit(1),
    ]).catch(() => ({ documents: [] }));
    return !!rows.documents[0];
  }
  return false;
}

async function findConnectedAccount(databases, payload) {
  if (payload.stripe_account_id) {
    const rows = await databases.listDocuments(DB_ID, 'stripe_connected_accounts', [
      Query.equal('stripe_account_id', payload.stripe_account_id),
      Query.limit(1),
    ]);
    return rows.documents[0] || null;
  }
  const ownerType = payload.owner_type === 'org' ? 'org' : 'coach';
  if (!payload.owner_id) return null;
  const rows = await databases.listDocuments(DB_ID, 'stripe_connected_accounts', [
    Query.equal('owner_type', ownerType),
    Query.equal('owner_id', payload.owner_id),
    Query.limit(1),
  ]);
  return rows.documents[0] || null;
}

export default async ({ req, res, error }) => {
  try {
    if (!process.env.STRIPE_SECRET_KEY) return res.json({ error: 'STRIPE_SECRET_KEY is not configured.' }, 500);
    const accountId = callerAccountId(req);
    if (!accountId) return res.json({ error: 'Authentication required.' }, 401);

    const payload = body(req);
    const databases = db();
    const profile = await profileForAccount(databases, accountId);
    if (!profile) return res.json({ error: 'No profile found for caller.' }, 404);

    const record = await findConnectedAccount(databases, payload);
    if (!record?.stripe_account_id) return res.json({ error: 'Stripe connected account record not found.' }, 404);
    if (!(await canManageOwner(databases, profile, record.owner_type, record.owner_id))) {
      return res.json({ error: 'You do not have access to this Stripe account owner.' }, 403);
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: STRIPE_API_VERSION });
    const account = await stripe.accounts.retrieve(record.stripe_account_id);
    const update = {
      charges_enabled: !!account.charges_enabled,
      payouts_enabled: !!account.payouts_enabled,
      details_submitted: !!account.details_submitted,
      requirements_due: JSON.stringify(account.requirements?.currently_due || []),
      disabled_reason: account.requirements?.disabled_reason || '',
      last_synced_at: new Date().toISOString(),
    };
    const updated = await databases.updateDocument(DB_ID, 'stripe_connected_accounts', record.$id, update);
    if (record.owner_type === 'coach') {
      await databases.updateDocument(DB_ID, 'coaches', record.owner_id, { stripe_account_id: record.stripe_account_id }).catch(() => {});
    } else {
      await databases.updateDocument(DB_ID, 'organizations', record.owner_id, { stripe_account_id: record.stripe_account_id }).catch(() => {});
    }
    return res.json({
      record_id: updated.$id,
      stripe_account_id: updated.stripe_account_id,
      charges_enabled: updated.charges_enabled,
      payouts_enabled: updated.payouts_enabled,
      details_submitted: updated.details_submitted,
      requirements_due: updated.requirements_due,
      disabled_reason: updated.disabled_reason,
    });
  } catch (err) {
    error?.(err?.message || String(err));
    return res.json({ error: 'Could not refresh Stripe connected account.', detail: err?.message || String(err) }, 500);
  }
};
