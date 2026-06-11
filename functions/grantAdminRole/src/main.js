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

const MANAGED_LABELS = new Set(['admin', 'super_admin', 'superadmin', 'coach']);
const GRANTABLE = new Set(['coach', 'admin', 'super_admin']);

// A set of granted roles (subset of coach/admin/super_admin) -> account labels.
function rolesToLabels(roleSet) {
  const labels = new Set();
  if (roleSet.has('coach')) labels.add('coach');
  if (roleSet.has('admin')) labels.add('admin');
  if (roleSet.has('super_admin')) { labels.add('admin'); labels.add('superadmin'); }
  return labels;
}

// The single profile.role kept for display / existing single-role logic.
function highestRole(roleSet) {
  if (roleSet.has('super_admin')) return 'super_admin';
  if (roleSet.has('admin')) return 'admin';
  if (roleSet.has('coach')) return 'coach';
  return 'user';
}

// Derive the current granted roles from an account's labels.
function labelsToRoles(labels = []) {
  const roles = [];
  if (labels.includes('coach')) roles.push('coach');
  if (labels.includes('superadmin')) roles.push('super_admin');
  else if (labels.includes('admin')) roles.push('admin');
  return roles;
}

// Stack the granted role labels onto the account, preserving any non-managed
// labels and replacing the managed ones with exactly the requested set.
async function applyAccountLabels(users, accountId, roleSet) {
  if (!accountId) return;
  const account = await users.get(accountId).catch(() => null);
  if (!account) return;
  const next = new Set((account.labels || []).filter((label) => !MANAGED_LABELS.has(label)));
  for (const label of rolesToLabels(roleSet)) next.add(label);
  await users.updateLabels(accountId, [...next]);
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

// Normalize incoming roles: accept either `roles: [...]` (stacked) or the legacy
// single `role`. Returns a Set of grantable roles ('user'/empty array => demote),
// or null for a missing/unrecognized shape — callers must 400, never demote, on
// a payload that doesn't clearly express intent.
function parseRoles(payload) {
  let input;
  if (Array.isArray(payload.roles)) input = payload.roles;
  else if (payload.role !== undefined) input = [payload.role];
  else return null;
  const set = new Set();
  for (const r of input) {
    if (r === 'user') continue;
    if (!GRANTABLE.has(r)) return null;
    set.add(r);
  }
  return set;
}

export default async ({ req, res, error }) => {
  try {
    const accountId = callerAccountId(req);
    if (!accountId) return res.json({ error: 'Authentication required.' }, 401);

    const { databases, users } = db();
    // Authorization: superadmin account label (Users API) + locked master profile.
    const callerAccount = await users.get(accountId).catch(() => null);
    const callerLabels = callerAccount?.labels || [];
    const actor = await profileForAccount(databases, accountId);
    if (!callerLabels.includes('superadmin') || actor?.master_admin_locked !== true) {
      return res.json({ error: 'Only the locked master admin can grant platform roles.' }, 403);
    }

    const payload = body(req);
    const targetProfileId = payload.profile_id;
    if (!targetProfileId) return res.json({ error: 'profile_id is required.' }, 400);

    const target = await databases.getDocument(DB_ID, 'profiles', targetProfileId);
    const isSelf = target.account_id === accountId;

    // Read-only: report the target's current stacked roles (for the UI editor).
    if (payload.action === 'getRoles') {
      const targetAccount = await users.get(target.account_id).catch(() => null);
      return res.json({
        profile_id: target.$id,
        roles: labelsToRoles(targetAccount?.labels || []),
        role: target.role || 'user',
        master_admin_locked: !!target.master_admin_locked,
      });
    }

    // The locked master admin can only be altered by themselves, and can never
    // strip their own super_admin (prevents self-lockout).
    if (target.master_admin_locked && !isSelf) {
      return res.json({ error: 'Cannot alter the locked master admin.' }, 403);
    }

    const roleSet = parseRoles(payload);
    if (roleSet === null) {
      return res.json({ error: 'Provide roles (array subset of coach/admin/super_admin) or role (coach|admin|super_admin|user).' }, 400);
    }
    if (target.master_admin_locked && isSelf) roleSet.add('super_admin');

    // The legacy single-`role` shape can't express a stacked set, so it must
    // not silently strip an existing coach label. Demotion to plain user
    // (role: 'user') stays a full reset; the stacked `roles: []` shape stays
    // exact-set (callers send the complete set).
    if (!Array.isArray(payload.roles) && payload.role !== undefined && payload.role !== 'user') {
      const targetAccount = await users.get(target.account_id).catch(() => null);
      if (targetAccount?.labels?.includes('coach')) roleSet.add('coach');
    }

    // Minting a super admin for someone else stays a deliberate, explicit act.
    if (roleSet.has('super_admin') && !isSelf && payload.allow_super_admin !== true) {
      return res.json({ error: 'Granting another super admin requires allow_super_admin=true.' }, 400);
    }

    const now = new Date().toISOString();
    const nextRole = highestRole(roleSet);
    const isPlatformAdminRole = roleSet.has('admin') || roleSet.has('super_admin');
    const existingAssignments = await openPlatformAssignments(databases, targetProfileId);
    await revokeOpenAssignments(databases, existingAssignments, now);

    const updated = await databases.updateDocument(DB_ID, 'profiles', targetProfileId, { role: nextRole });
    await applyAccountLabels(users, target.account_id, roleSet);
    const assignment = isPlatformAdminRole
      ? await databases.createDocument(DB_ID, 'admin_assignments', ID.unique(), {
        profile_id: targetProfileId,
        scope: 'platform',
        role: nextRole,
        granted_by_master_admin_id: actor.$id,
        granted_at: now,
      }).catch(() => null)
      : null;

    const grantedRoles = [...roleSet];
    await databases.createDocument(DB_ID, 'audit_logs', ID.unique(), {
      actor_email: actor.email,
      actor_role: 'super_admin',
      action: isPlatformAdminRole ? 'admin_assignment.grant' : 'admin_assignment.revoke',
      entity_type: 'Profile',
      entity_id: targetProfileId,
      before: JSON.stringify({ role: target.role || 'user' }),
      after: JSON.stringify({ role: nextRole, roles: grantedRoles }),
      metadata: JSON.stringify({
        assignment_id: assignment?.$id || '',
        revoked_assignment_ids: existingAssignments.map((item) => item.$id),
        target_email: target.email || '',
        actor_profile_id: actor.$id,
        granted_roles: grantedRoles,
        self: isSelf,
      }),
    }).catch(() => {});

    return res.json({
      profile_id: updated.$id,
      role: updated.role,
      roles: grantedRoles,
      assignment_id: assignment?.$id || '',
      revoked_assignment_ids: existingAssignments.map((item) => item.$id),
    });
  } catch (err) {
    error?.(err?.message || String(err));
    return res.json({ error: 'Could not update roles.' }, 500);
  }
};
