import { Client, Databases, ID, Query, Users } from 'node-appwrite';

const DB_ID = process.env.APPWRITE_DATABASE_ID || 'lctraining';

function db() {
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

function callerAccountId(req) {
  return req.headers?.['x-appwrite-user-id'] || req.headers?.['X-Appwrite-User-Id'] || req.headers?.['X-Appwrite-User-ID'];
}

async function syncAccountLabels(users, accountId, role) {
  if (!accountId) return;
  const account = await users.get(accountId).catch(() => null);
  if (!account) return;
  const labels = new Set((account.labels || []).filter((label) => label !== 'admin' && label !== 'super_admin' && label !== 'superadmin'));
  if (role === 'admin') labels.add('admin');
  if (role === 'super_admin') labels.add('admin').add('superadmin');
  await users.updateLabels(accountId, [...labels]);
}

async function profileForAccount(databases, accountId) {
  const rows = await databases.listDocuments(DB_ID, 'profiles', [
    Query.equal('account_id', accountId),
    Query.limit(1),
  ]);
  return rows.documents[0] || null;
}

async function openPlatformAssignments(databases, profileId) {
  const rows = await databases.listDocuments(DB_ID, 'admin_assignments', [
    Query.equal('profile_id', profileId),
    Query.equal('scope', 'platform'),
    Query.limit(50),
  ]).catch(() => ({ documents: [] }));
  return rows.documents.filter((assignment) => !assignment.revoked_at);
}

async function revokeOpenAssignments(databases, assignments, now) {
  await Promise.all(assignments.map((assignment) =>
    databases.updateDocument(DB_ID, 'admin_assignments', assignment.$id, {
      revoked_at: now,
    }).catch(() => null)
  ));
}

export default async ({ req, res, error }) => {
  try {
    const accountId = callerAccountId(req);
    if (!accountId) return res.json({ error: 'Authentication required.' }, 401);

    const { databases, users } = db();
    const actor = await profileForAccount(databases, accountId);
    if (actor?.role !== 'super_admin' || actor?.master_admin_locked !== true) {
      return res.json({ error: 'Only the locked master admin can grant platform admin roles.' }, 403);
    }

    const payload = body(req);
    const targetProfileId = payload.profile_id;
    const allowedRoles = new Set(['user', 'coach', 'admin', 'super_admin']);
    const role = allowedRoles.has(payload.role) ? payload.role : 'admin';
    if (!targetProfileId) return res.json({ error: 'profile_id is required.' }, 400);
    if (role === 'super_admin' && payload.allow_super_admin !== true) {
      return res.json({ error: 'Granting another super admin requires allow_super_admin=true.' }, 400);
    }

    const target = await databases.getDocument(DB_ID, 'profiles', targetProfileId);
    if (target.master_admin_locked) return res.json({ error: 'Cannot alter the locked master admin.' }, 403);

    const now = new Date().toISOString();
    const isPlatformAdminRole = role === 'admin' || role === 'super_admin';
    const existingAssignments = await openPlatformAssignments(databases, targetProfileId);
    await revokeOpenAssignments(databases, existingAssignments, now);

    const updated = await databases.updateDocument(DB_ID, 'profiles', targetProfileId, { role });
    await syncAccountLabels(users, target.account_id, role);
    const assignment = isPlatformAdminRole
      ? await databases.createDocument(DB_ID, 'admin_assignments', ID.unique(), {
        profile_id: targetProfileId,
        scope: 'platform',
        role,
        granted_by_master_admin_id: actor.$id,
        granted_at: now,
      }).catch(() => null)
      : null;

    await databases.createDocument(DB_ID, 'audit_logs', ID.unique(), {
      actor_email: actor.email,
      actor_role: 'super_admin',
      action: isPlatformAdminRole ? 'admin_assignment.grant' : 'admin_assignment.revoke',
      entity_type: 'Profile',
      entity_id: targetProfileId,
      before: JSON.stringify({ role: target.role || 'user' }),
      after: JSON.stringify({ role }),
      metadata: JSON.stringify({
        assignment_id: assignment?.$id || '',
        revoked_assignment_ids: existingAssignments.map((item) => item.$id),
        target_email: target.email || '',
        actor_profile_id: actor.$id,
      }),
    }).catch(() => {});

    return res.json({
      profile_id: updated.$id,
      role: updated.role,
      assignment_id: assignment?.$id || '',
      revoked_assignment_ids: existingAssignments.map((item) => item.$id),
    });
  } catch (err) {
    error?.(err?.message || String(err));
    return res.json({ error: 'Could not grant admin role.', detail: err?.message || String(err) }, 500);
  }
};
