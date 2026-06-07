import { Client, Databases, Query } from 'node-appwrite';
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

    const rows = await databases.listDocuments(DB_ID, 'stripe_connected_accounts', [
      Query.equal('owner_type', ownerType),
      Query.equal('owner_id', ownerId),
      Query.limit(1),
    ]);
    const record = rows.documents[0];
    if (!record?.stripe_account_id) return res.json({ error: 'No Stripe connected account exists for this owner.' }, 404);

    const base = (process.env.APP_BASE_URL || 'http://localhost:5173').replace(/\/$/, '');
    const path = ownerType === 'org' ? '/organization' : '/coach/earnings';
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: STRIPE_API_VERSION });
    const link = await stripe.accountLinks.create({
      account: record.stripe_account_id,
      refresh_url: `${base}${path}?stripe_refresh=1`,
      return_url: `${base}${path}?stripe_return=1`,
      type: 'account_onboarding',
    });
    return res.json({ url: link.url });
  } catch (err) {
    error?.(err?.message || String(err));
    return res.json({ error: 'Could not create Stripe onboarding link.', detail: err?.message || String(err) }, 500);
  }
};
