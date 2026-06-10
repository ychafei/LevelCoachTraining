import { Client, Databases, Users, ID, Query } from 'node-appwrite';

const DB_ID = process.env.APPWRITE_DATABASE_ID || 'lctraining';
// MASTER_ADMIN_EMAIL must come from the server environment — no hardcoded fallback.
const MASTER_EMAIL = (process.env.MASTER_ADMIN_EMAIL || '').trim().toLowerCase();

function services() {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://nyc.cloud.appwrite.io/v1')
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);
  return { databases: new Databases(client), users: new Users(client) };
}

function callerAccountId(req) {
  return req.headers?.['x-appwrite-user-id'] || req.headers?.['X-Appwrite-User-Id'] || req.headers?.['X-Appwrite-User-ID'];
}

export default async ({ req, res, error }) => {
  try {
    if (!MASTER_EMAIL) {
      return res.json({ error: 'MASTER_ADMIN_EMAIL is not configured.' }, 500);
    }
    const accountId = callerAccountId(req);
    if (!accountId) return res.json({ error: 'Authentication required.' }, 401);

    const { databases, users } = services();
    const account = await users.get(accountId);
    const email = (account.email || '').trim().toLowerCase();
    if (email !== MASTER_EMAIL) return res.json({ error: 'This account is not the configured master admin.' }, 403);
    if (account.emailVerification !== true) return res.json({ error: 'Master admin email must be verified before bootstrap.' }, 403);

    const rows = await databases.listDocuments(DB_ID, 'profiles', [
      Query.equal('account_id', accountId),
      Query.limit(1),
    ]);
    const now = new Date().toISOString();
    const data = {
      account_id: accountId,
      email,
      role: 'super_admin',
      first_name: rows.documents[0]?.first_name || account.name?.split(/\s+/)[0] || '',
      last_name: rows.documents[0]?.last_name || account.name?.split(/\s+/).slice(1).join(' ') || '',
      profile_setup_complete: true,
      master_admin_locked: true,
      master_admin_bootstrapped_at: rows.documents[0]?.master_admin_bootstrapped_at || now,
      onboarding_status: 'complete',
    };
    const profile = rows.documents[0]
      ? await databases.updateDocument(DB_ID, 'profiles', rows.documents[0].$id, data)
      : await databases.createDocument(DB_ID, 'profiles', ID.unique(), data);
    await users.updateLabels(accountId, [...new Set([...(account.labels || []), 'admin', 'superadmin'])]).catch(() => {});

    const assignmentRows = await databases.listDocuments(DB_ID, 'admin_assignments', [
      Query.equal('profile_id', profile.$id),
      Query.equal('scope', 'platform'),
      Query.limit(1),
    ]).catch(() => ({ documents: [] }));
    if (!assignmentRows.documents[0]) {
      await databases.createDocument(DB_ID, 'admin_assignments', ID.unique(), {
        profile_id: profile.$id,
        scope: 'platform',
        role: 'super_admin',
        granted_by_master_admin_id: profile.$id,
        granted_at: now,
      }).catch(() => {});
    }

    await databases.createDocument(DB_ID, 'audit_logs', ID.unique(), {
      actor_email: email,
      actor_role: 'super_admin',
      action: 'master_admin.bootstrap',
      entity_type: 'Profile',
      entity_id: profile.$id,
      after: JSON.stringify({ role: 'super_admin', master_admin_locked: true }),
      metadata: JSON.stringify({ source: 'bootstrapMasterAdmin' }),
    }).catch(() => {});

    return res.json({ profile_id: profile.$id, role: profile.role, master_admin_locked: true });
  } catch (err) {
    error?.(err?.message || String(err));
    return res.json({ error: 'Could not bootstrap master admin.' }, 500);
  }
};
