import { Client, Databases, ID, Query } from 'node-appwrite';
import Stripe from 'stripe';

const DB_ID = process.env.APPWRITE_DATABASE_ID || 'lctraining';
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

async function ownerEmail(databases, ownerType, ownerId, profile, fallbackEmail) {
  if (fallbackEmail) return fallbackEmail;
  if (ownerType === 'coach') {
    const coach = await databases.getDocument(DB_ID, 'coaches', ownerId).catch(() => null);
    return coach?.email || profile?.email || '';
  }
  const org = await databases.getDocument(DB_ID, 'organizations', ownerId).catch(() => null);
  return org?.contact_email || profile?.email || '';
}

export default async ({ req, res, error }) => {
  try {
    if (!process.env.STRIPE_SECRET_KEY) return res.json({ error: 'STRIPE_SECRET_KEY is not configured.' }, 500);
    const accountId = callerAccountId(req);
    if (!accountId) return res.json({ error: 'Authentication required.' }, 401);

    const payload = body(req);
    const ownerType = payload.owner_type === 'org' ? 'org' : 'coach';
    const ownerId = payload.owner_id;
    if (!ownerId) return res.json({ error: 'owner_id is required.' }, 400);

    const databases = db();
    const profile = await profileForAccount(databases, accountId);
    if (!profile) return res.json({ error: 'No profile found for caller.' }, 404);
    if (!(await canManageOwner(databases, profile, ownerType, ownerId))) {
      return res.json({ error: 'You do not have access to this Stripe account owner.' }, 403);
    }

    const existing = await databases.listDocuments(DB_ID, 'stripe_connected_accounts', [
      Query.equal('owner_type', ownerType),
      Query.equal('owner_id', ownerId),
      Query.limit(1),
    ]);
    if (existing.documents[0]?.stripe_account_id) {
      return res.json({
        account_id: existing.documents[0].stripe_account_id,
        record_id: existing.documents[0].$id,
        already_exists: true,
      });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: STRIPE_API_VERSION });
    const account = await stripe.accounts.create({
      country: 'US',
      email: await ownerEmail(databases, ownerType, ownerId, profile, payload.email),
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

    const data = {
      owner_type: ownerType,
      owner_id: ownerId,
      stripe_account_id: account.id,
      account_mode: 'controller_express',
      charges_enabled: !!account.charges_enabled,
      payouts_enabled: !!account.payouts_enabled,
      details_submitted: !!account.details_submitted,
      requirements_due: JSON.stringify(account.requirements?.currently_due || []),
      disabled_reason: account.requirements?.disabled_reason || '',
      last_synced_at: new Date().toISOString(),
    };
    const row = await databases.createDocument(DB_ID, 'stripe_connected_accounts', ID.unique(), data);
    if (ownerType === 'coach') {
      await databases.updateDocument(DB_ID, 'coaches', ownerId, { stripe_account_id: account.id }).catch(() => {});
    } else {
      await databases.updateDocument(DB_ID, 'organizations', ownerId, { stripe_account_id: account.id }).catch(() => {});
    }

    return res.json({ account_id: account.id, record_id: row.$id });
  } catch (err) {
    error?.(err?.message || String(err));
    return res.json({ error: 'Could not create Stripe connected account.', detail: err?.message || String(err) }, 500);
  }
};
