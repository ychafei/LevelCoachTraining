import { Client, Databases, Users, ID, Permission, Query, Role } from 'node-appwrite';
import { randomBytes } from 'node:crypto';

const DB_ID = process.env.APPWRITE_DATABASE_ID || 'lctraining';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

async function emailIsBanned(databases, email) {
  if (!email) return false;
  const rows = await databases.listDocuments(DB_ID, 'user_bans', [
    Query.equal('banned_email', email),
    Query.equal('is_active', true),
    Query.limit(1),
  ]).catch(() => ({ documents: [] }));
  return rows.documents.length > 0;
}

async function writeAudit(databases, entry) {
  const data = { ...entry };
  if (!['admin', 'super_admin'].includes(data.actor_role)) delete data.actor_role;
  await databases.createDocument(DB_ID, 'audit_logs', ID.unique(), data).catch(() => {});
}

async function sendEmail({ to, subject, html }, error) {
  try {
    if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not configured.');
    const from = process.env.EMAIL_FROM || 'LevelCoach Training <no-reply@levelcoach.com>';
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.message || data?.error || `Resend returned ${response.status}`);
    }
  } catch (err) {
    error?.(`email send failed: ${err?.message || err}`);
  }
}

function str(value, min, max) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) return undefined;
  return trimmed;
}

function int(value, min, max) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) return undefined;
  return n;
}

// Create a coach document, tolerating a live `coaches` collection that is
// missing newer attributes (the ~25-attribute cap means some marketplace
// fields may not exist). On an "Unknown attribute" error we drop that key and
// retry, so the write succeeds with whatever the schema currently supports.
async function createCoachResilient(databases, data) {
  const payload = { ...data };
  for (let i = 0; i < 25; i += 1) {
    try {
      return await databases.createDocument(DB_ID, 'coaches', ID.unique(), payload);
    } catch (err) {
      const match = String(err?.message || '').match(/Unknown attribute:\s*"?([a-zA-Z0-9_]+)"?/);
      if (match && Object.prototype.hasOwnProperty.call(payload, match[1])) {
        delete payload[match[1]];
        continue;
      }
      throw err;
    }
  }
  throw new Error('Could not create coach record.');
}

// Update a coach document with the same strip-unknown-attribute-and-retry
// resilience as the create path. Returns the updated doc, or null if nothing
// could be written.
async function updateCoachResilient(databases, coachId, updates) {
  const payload = { ...updates };
  for (let i = 0; i < 25; i += 1) {
    if (Object.keys(payload).length === 0) return null;
    try {
      return await databases.updateDocument(DB_ID, 'coaches', coachId, payload);
    } catch (err) {
      const match = String(err?.message || '').match(/Unknown attribute:\s*"?([a-zA-Z0-9_]+)"?/);
      if (match && Object.prototype.hasOwnProperty.call(payload, match[1])) {
        delete payload[match[1]];
        continue;
      }
      throw err;
    }
  }
  return null;
}

// Find the profile linked to this coach (profiles.coach_id === coachId).
async function profileForCoach(databases, coachId) {
  const rows = await databases.listDocuments(DB_ID, 'profiles', [
    Query.equal('coach_id', coachId),
    Query.limit(1),
  ]).catch(() => ({ documents: [] }));
  return rows.documents[0] || null;
}

// --- Action handlers ----------------------------------------------------------

async function inviteUser(ctx, payload) {
  const { databases, users, actor, error } = ctx;
  const email = String(payload.email || '').trim().toLowerCase();
  const role = String(payload.role || 'user');
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return { status: 400, body: { error: 'A valid email is required.' } };
  }
  // Admin roles are only grantable through grantAdminRole (master-admin locked).
  if (!['user', 'coach'].includes(role)) {
    return { status: 400, body: { error: 'role must be user or coach.' } };
  }

  const existingProfiles = await databases.listDocuments(DB_ID, 'profiles', [
    Query.equal('email', email),
    Query.limit(1),
  ]);
  if (existingProfiles.documents[0]) {
    return { status: 409, body: { error: 'An account with this email already exists.' } };
  }

  // Random throwaway password — the invitee sets their own via password reset.
  const password = randomBytes(32).toString('hex');
  let account;
  try {
    account = await users.create(ID.unique(), email, undefined, password);
  } catch (err) {
    error?.(err?.message || String(err));
    return { status: 409, body: { error: 'Could not create an account for this email.' } };
  }
  if (role === 'coach') {
    await users.updateLabels(account.$id, ['coach']).catch(() => {});
  }

  const profile = await databases.createDocument(DB_ID, 'profiles', ID.unique(), {
    account_id: account.$id,
    email,
    role,
  }, [Permission.read(Role.user(account.$id))]);

  const appBaseUrl = (process.env.APP_BASE_URL || 'http://localhost:5173').replace(/\/$/, '');
  await sendEmail({
    to: email,
    subject: 'LevelCoach Training - You have been invited',
    html: `
      <p>You have been invited to LevelCoach Training.</p>
      <p>Visit <a href="${appBaseUrl}">${appBaseUrl}</a>, choose "Forgot password", and enter this email address to set your password and sign in.</p>
    `,
  }, error);

  await writeAudit(databases, {
    actor_email: actor.email,
    actor_role: actor.role,
    action: 'admin.invite_user',
    entity_type: 'Profile',
    entity_id: profile.$id,
    after: JSON.stringify({ email, role }),
    metadata: JSON.stringify({ account_id: account.$id }),
  });
  return { status: 200, body: { ok: true, profile_id: profile.$id, account_id: account.$id } };
}

async function grantCredits(ctx, payload) {
  const { databases, actor } = ctx;
  const profileId = String(payload.client_profile_id || '');
  const packageName = str(payload.package_name, 1, 200);
  const totalCredits = int(payload.total_credits, 1, 1000);
  const durationMinutes = int(payload.session_duration_minutes, 15, 480);
  if (!profileId) return { status: 400, body: { error: 'client_profile_id is required.' } };
  if (packageName === undefined) return { status: 400, body: { error: 'package_name is required (max 200 chars).' } };
  if (totalCredits === undefined) return { status: 400, body: { error: 'total_credits must be an integer 1-1000.' } };
  if (durationMinutes === undefined) return { status: 400, body: { error: 'session_duration_minutes must be an integer 15-480.' } };

  const profile = await databases.getDocument(DB_ID, 'profiles', profileId).catch(() => null);
  if (!profile?.email) return { status: 404, body: { error: 'Client profile not found.' } };

  let coachId = '';
  if (payload.coach_id) {
    const coach = await databases.getDocument(DB_ID, 'coaches', String(payload.coach_id)).catch(() => null);
    if (!coach) return { status: 404, body: { error: 'Coach not found.' } };
    coachId = coach.$id;
  }

  const grants = profile.account_id ? [Permission.read(Role.user(profile.account_id))] : [];
  const credit = await databases.createDocument(DB_ID, 'session_credits', ID.unique(), {
    client_email: profile.email,
    client_name: [profile.first_name, profile.last_name].filter(Boolean).join(' '),
    package_id: 'admin_grant',
    package_name: packageName,
    total_credits: totalCredits,
    used_credits: 0,
    session_duration_minutes: durationMinutes,
    payment_processor: 'admin_grant',
    amount_cents: 0,
    ...(coachId ? { coach_id: coachId } : {}),
  }, grants);

  await writeAudit(databases, {
    actor_email: actor.email,
    actor_role: actor.role,
    action: 'credits.grant',
    entity_type: 'SessionCredit',
    entity_id: credit.$id,
    after: JSON.stringify({ total_credits: totalCredits, session_duration_minutes: durationMinutes, amount_cents: 0 }),
    metadata: JSON.stringify({ client_profile_id: profileId, coach_id: coachId }),
  });
  return { status: 200, body: { ok: true, credit_id: credit.$id } };
}

async function revokeCredits(ctx, payload) {
  const { databases, actor } = ctx;
  const creditId = String(payload.credit_id || '');
  const reason = str(payload.reason, 3, 1000);
  if (!creditId) return { status: 400, body: { error: 'credit_id is required.' } };
  if (reason === undefined) return { status: 400, body: { error: 'reason is required (3-1000 chars).' } };

  const credit = await databases.getDocument(DB_ID, 'session_credits', creditId).catch(() => null);
  if (!credit) return { status: 404, body: { error: 'Credit not found.' } };

  await databases.updateDocument(DB_ID, 'session_credits', creditId, {
    used_credits: credit.total_credits,
  });
  await writeAudit(databases, {
    actor_email: actor.email,
    actor_role: actor.role,
    action: 'credits.revoke',
    entity_type: 'SessionCredit',
    entity_id: creditId,
    before: JSON.stringify({ used_credits: credit.used_credits, total_credits: credit.total_credits }),
    after: JSON.stringify({ used_credits: credit.total_credits }),
    reason,
    metadata: JSON.stringify({ client_email: credit.client_email }),
  });
  return { status: 200, body: { ok: true } };
}

async function banUser(ctx, payload) {
  const { databases, users, actor, labels } = ctx;
  const profileId = String(payload.profile_id || '');
  const reason = str(payload.reason, 3, 1000);
  if (!profileId) return { status: 400, body: { error: 'profile_id is required.' } };
  if (reason === undefined) return { status: 400, body: { error: 'reason is required (3-1000 chars).' } };

  const target = await databases.getDocument(DB_ID, 'profiles', profileId).catch(() => null);
  if (!target?.email) return { status: 404, body: { error: 'Profile not found.' } };
  if (target.master_admin_locked) return { status: 403, body: { error: 'The master admin cannot be banned.' } };
  if (target.account_id) {
    const targetAccount = await users.get(target.account_id).catch(() => null);
    const targetLabels = targetAccount?.labels || [];
    if ((targetLabels.includes('admin') || targetLabels.includes('superadmin')) && !labels.includes('superadmin')) {
      return { status: 403, body: { error: 'Only a super admin can ban an admin.' } };
    }
  }

  const ban = await databases.createDocument(DB_ID, 'user_bans', ID.unique(), {
    banned_email: target.email,
    banned_by_email: actor.email,
    reason,
    is_permanent: payload.permanent === true,
    is_active: true,
  });
  await databases.updateDocument(DB_ID, 'profiles', profileId, { suspended: true }).catch(() => {});

  await writeAudit(databases, {
    actor_email: actor.email,
    actor_role: actor.role,
    action: 'user.ban',
    entity_type: 'Profile',
    entity_id: profileId,
    after: JSON.stringify({ banned: true, permanent: payload.permanent === true }),
    reason,
    metadata: JSON.stringify({ ban_id: ban.$id, banned_email: target.email }),
  });
  return { status: 200, body: { ok: true, ban_id: ban.$id } };
}

async function unbanUser(ctx, payload) {
  const { databases, actor } = ctx;
  const profileId = String(payload.profile_id || '');
  if (!profileId) return { status: 400, body: { error: 'profile_id is required.' } };
  const target = await databases.getDocument(DB_ID, 'profiles', profileId).catch(() => null);
  if (!target?.email) return { status: 404, body: { error: 'Profile not found.' } };

  const now = new Date().toISOString();
  const bans = await databases.listDocuments(DB_ID, 'user_bans', [
    Query.equal('banned_email', target.email),
    Query.equal('is_active', true),
    Query.limit(50),
  ]);
  for (const ban of bans.documents) {
    await databases.updateDocument(DB_ID, 'user_bans', ban.$id, {
      is_active: false,
      unbanned_by_email: actor.email,
      unbanned_at: now,
    });
  }
  await databases.updateDocument(DB_ID, 'profiles', profileId, { suspended: false }).catch(() => {});

  await writeAudit(databases, {
    actor_email: actor.email,
    actor_role: actor.role,
    action: 'user.unban',
    entity_type: 'Profile',
    entity_id: profileId,
    after: JSON.stringify({ banned: false }),
    metadata: JSON.stringify({ lifted_ban_ids: bans.documents.map((b) => b.$id) }),
  });
  return { status: 200, body: { ok: true, lifted: bans.documents.length } };
}

async function linkCoachAccount(ctx, payload) {
  const { databases, users, actor } = ctx;
  const coachId = String(payload.coach_id || '');
  const profileId = String(payload.profile_id || '');
  if (!coachId || !profileId) return { status: 400, body: { error: 'coach_id and profile_id are required.' } };

  const [coach, profile] = await Promise.all([
    databases.getDocument(DB_ID, 'coaches', coachId).catch(() => null),
    databases.getDocument(DB_ID, 'profiles', profileId).catch(() => null),
  ]);
  if (!coach) return { status: 404, body: { error: 'Coach not found.' } };
  if (!profile?.account_id) return { status: 404, body: { error: 'Profile not found or has no account.' } };

  await databases.updateDocument(DB_ID, 'coaches', coachId, { user_id: profile.account_id });
  await databases.updateDocument(DB_ID, 'profiles', profileId, { role: 'coach', coach_id: coachId });
  const account = await users.get(profile.account_id).catch(() => null);
  if (account) {
    await users.updateLabels(profile.account_id, [...new Set([...(account.labels || []), 'coach'])]).catch(() => {});
  }

  await writeAudit(databases, {
    actor_email: actor.email,
    actor_role: actor.role,
    action: 'coach.link_account',
    entity_type: 'Coach',
    entity_id: coachId,
    after: JSON.stringify({ user_id: profile.account_id, profile_id: profileId }),
    metadata: JSON.stringify({ profile_email: profile.email || '' }),
  });
  return { status: 200, body: { ok: true } };
}

async function unlinkCoachAccount(ctx, payload) {
  const { databases, users, actor } = ctx;
  const coachId = String(payload.coach_id || '');
  if (!coachId) return { status: 400, body: { error: 'coach_id is required.' } };

  const coach = await databases.getDocument(DB_ID, 'coaches', coachId).catch(() => null);
  if (!coach) return { status: 404, body: { error: 'Coach not found.' } };

  // Inverse of linkCoachAccount: clear the coach's user_id, drop the link on
  // the linked profile (coach_id + coach role), and remove the coach label.
  const profile = await profileForCoach(databases, coachId);
  const accountId = profile?.account_id || coach.user_id || '';

  await databases.updateDocument(DB_ID, 'coaches', coachId, { user_id: '' }).catch(() => {});
  if (profile) {
    await databases.updateDocument(DB_ID, 'profiles', profile.$id, { role: 'user', coach_id: '' }).catch(() => {});
  }
  if (accountId) {
    const account = await users.get(accountId).catch(() => null);
    if (account) {
      await users.updateLabels(accountId, (account.labels || []).filter((l) => l !== 'coach')).catch(() => {});
    }
  }

  await writeAudit(databases, {
    actor_email: actor.email,
    actor_role: actor.role,
    action: 'coach.unlink_account',
    entity_type: 'Coach',
    entity_id: coachId,
    before: JSON.stringify({ user_id: coach.user_id || '', profile_id: profile?.$id || '' }),
    after: JSON.stringify({ user_id: '', profile_id: '' }),
    metadata: JSON.stringify({ profile_email: profile?.email || '' }),
  });
  return { status: 200, body: { ok: true } };
}

async function createCoach(ctx, payload) {
  const { databases, actor } = ctx;
  const fields = payload.fields;
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
    return { status: 400, body: { error: 'fields must be an object (coach document body).' } };
  }

  let coach;
  try {
    coach = await createCoachResilient(databases, { ...fields });
  } catch (err) {
    ctx.error?.(err?.message || String(err));
    return { status: 500, body: { error: 'Could not create the coach record.' } };
  }

  // Optionally link the new coach to an existing profile.
  const profileId = str(payload.profile_id ?? '', 0, 64);
  if (profileId) {
    await databases.updateDocument(DB_ID, 'profiles', profileId, { coach_id: coach.$id }).catch((err) => {
      ctx.error?.(`createCoach: failed to set profile.coach_id: ${err?.message || err}`);
    });
  }

  await writeAudit(databases, {
    actor_email: actor.email,
    actor_role: actor.role,
    action: 'coach.create',
    entity_type: 'Coach',
    entity_id: coach.$id,
    after: JSON.stringify({ coach_id: coach.$id }),
    metadata: JSON.stringify({ profile_id: profileId || '' }),
  });
  return { status: 200, body: { ok: true, coach } };
}

async function updateCoach(ctx, payload) {
  const { databases, actor } = ctx;
  const coachId = String(payload.coach_id || '');
  const updates = payload.updates;
  if (!coachId) return { status: 400, body: { error: 'coach_id is required.' } };
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    return { status: 400, body: { error: 'updates must be an object.' } };
  }
  if (Object.keys(updates).length === 0) {
    return { status: 400, body: { error: 'updates must include at least one field.' } };
  }

  const coach = await databases.getDocument(DB_ID, 'coaches', coachId).catch(() => null);
  if (!coach) return { status: 404, body: { error: 'Coach not found.' } };

  let updated;
  try {
    updated = await updateCoachResilient(databases, coachId, { ...updates });
  } catch (err) {
    ctx.error?.(err?.message || String(err));
    return { status: 500, body: { error: 'Could not update the coach record.' } };
  }

  await writeAudit(databases, {
    actor_email: actor.email,
    actor_role: actor.role,
    action: 'coach.update',
    entity_type: 'Coach',
    entity_id: coachId,
    after: JSON.stringify({ keys: Object.keys(updates) }),
  });
  return { status: 200, body: { ok: true, coach: updated || coach } };
}

async function deleteCoach(ctx, payload) {
  const { databases, actor } = ctx;
  const coachId = String(payload.coach_id || '');
  if (!coachId) return { status: 400, body: { error: 'coach_id is required.' } };

  const coach = await databases.getDocument(DB_ID, 'coaches', coachId).catch(() => null);
  if (!coach) return { status: 404, body: { error: 'Coach not found.' } };

  // Ordering fix: delete the coach FIRST. Only after the delete succeeds do we
  // clear the linked profile's coach_id. The old order cleared the profile link
  // before the delete, orphaning the profile when the delete failed.
  try {
    await databases.deleteDocument(DB_ID, 'coaches', coachId);
  } catch (err) {
    ctx.error?.(err?.message || String(err));
    return { status: 500, body: { error: 'Could not delete the coach record.' } };
  }

  const profile = await profileForCoach(databases, coachId);
  if (profile) {
    await databases.updateDocument(DB_ID, 'profiles', profile.$id, { coach_id: '' }).catch((err) => {
      ctx.error?.(`deleteCoach: failed to clear profile.coach_id: ${err?.message || err}`);
    });
  }

  await writeAudit(databases, {
    actor_email: actor.email,
    actor_role: actor.role,
    action: 'coach.delete',
    entity_type: 'Coach',
    entity_id: coachId,
    before: JSON.stringify({ coach_id: coachId }),
    metadata: JSON.stringify({ profile_id: profile?.$id || '' }),
  });
  return { status: 200, body: { ok: true } };
}

async function setCoachFee(ctx, payload) {
  const { databases, actor, labels } = ctx;
  if (!labels.includes('superadmin')) {
    return { status: 403, body: { error: 'Super admin access required.' } };
  }
  const coachId = String(payload.coach_id || '');
  const feeBps = int(payload.platform_fee_bps, 0, 5000);
  if (!coachId) return { status: 400, body: { error: 'coach_id is required.' } };
  if (feeBps === undefined) return { status: 400, body: { error: 'platform_fee_bps must be an integer 0-5000.' } };

  const coach = await databases.getDocument(DB_ID, 'coaches', coachId).catch(() => null);
  if (!coach) return { status: 404, body: { error: 'Coach not found.' } };

  try {
    await databases.updateDocument(DB_ID, 'coaches', coachId, { platform_fee_bps: feeBps });
  } catch (err) {
    if (/Unknown attribute/.test(String(err?.message || ''))) {
      return { status: 409, body: { error: 'Per-coach fee overrides are not available on this collection. The global platform fee applies.' } };
    }
    throw err;
  }
  await writeAudit(databases, {
    actor_email: actor.email,
    actor_role: 'super_admin',
    action: 'coach.set_fee',
    entity_type: 'Coach',
    entity_id: coachId,
    before: JSON.stringify({ platform_fee_bps: coach.platform_fee_bps ?? null }),
    after: JSON.stringify({ platform_fee_bps: feeBps }),
  });
  return { status: 200, body: { ok: true } };
}

// Platform-wide fee: the global cut applied to bookings with no coach/org
// override. Stored in site_content (key 'platform_fee_bps', value as a string).
async function setPlatformFee(ctx, payload) {
  const { databases, actor, labels } = ctx;
  if (!labels.includes('superadmin')) {
    return { status: 403, body: { error: 'Super admin access required.' } };
  }
  const feeBps = int(payload.platform_fee_bps, 0, 5000);
  if (feeBps === undefined) {
    return { status: 400, body: { error: 'platform_fee_bps must be an integer 0-5000.' } };
  }

  const existing = await databases.listDocuments(DB_ID, 'site_content', [
    Query.equal('key', 'platform_fee_bps'),
    Query.limit(1),
  ]).catch(() => ({ documents: [] }));

  const before = existing.documents[0]?.value ?? null;
  if (existing.documents[0]) {
    await databases.updateDocument(DB_ID, 'site_content', existing.documents[0].$id, {
      value: String(feeBps),
      content_type: 'text',
    });
  } else {
    await databases.createDocument(DB_ID, 'site_content', ID.unique(), {
      key: 'platform_fee_bps',
      value: String(feeBps),
      content_type: 'text',
    });
  }

  await writeAudit(databases, {
    actor_email: actor.email,
    actor_role: 'super_admin',
    action: 'platform.set_fee',
    entity_type: 'SiteContent',
    entity_id: 'platform_fee_bps',
    before: JSON.stringify({ platform_fee_bps: before }),
    after: JSON.stringify({ platform_fee_bps: String(feeBps) }),
  });
  return { status: 200, body: { ok: true, platform_fee_bps: feeBps } };
}

// Per-organization platform-fee override: the platform's cut for bookings
// routed through this org. An admin decision (not org self-service).
async function setOrgFee(ctx, payload) {
  const { databases, actor } = ctx;
  const organizationId = String(payload.organization_id || '');
  const feeBps = int(payload.platform_fee_bps, 0, 5000);
  if (!organizationId) return { status: 400, body: { error: 'organization_id is required.' } };
  if (feeBps === undefined) {
    return { status: 400, body: { error: 'platform_fee_bps must be an integer 0-5000.' } };
  }

  const org = await databases.getDocument(DB_ID, 'organizations', organizationId).catch(() => null);
  if (!org) return { status: 404, body: { error: 'Organization not found.' } };

  await databases.updateDocument(DB_ID, 'organizations', organizationId, { platform_fee_bps: feeBps });
  await writeAudit(databases, {
    actor_email: actor.email,
    actor_role: actor.role,
    action: 'org.set_fee',
    entity_type: 'Organization',
    entity_id: organizationId,
    before: JSON.stringify({ platform_fee_bps: org.platform_fee_bps ?? null }),
    after: JSON.stringify({ platform_fee_bps: feeBps }),
  });
  return { status: 200, body: { ok: true, platform_fee_bps: feeBps } };
}

async function setCoachActive(ctx, payload) {
  const { databases, actor } = ctx;
  const coachId = String(payload.coach_id || '');
  if (!coachId) return { status: 400, body: { error: 'coach_id is required.' } };
  if (typeof payload.is_active !== 'boolean') {
    return { status: 400, body: { error: 'is_active must be a boolean.' } };
  }
  const coach = await databases.getDocument(DB_ID, 'coaches', coachId).catch(() => null);
  if (!coach) return { status: 404, body: { error: 'Coach not found.' } };

  await databases.updateDocument(DB_ID, 'coaches', coachId, { is_active: payload.is_active });
  await writeAudit(databases, {
    actor_email: actor.email,
    actor_role: actor.role,
    action: 'coach.set_active',
    entity_type: 'Coach',
    entity_id: coachId,
    before: JSON.stringify({ is_active: coach.is_active }),
    after: JSON.stringify({ is_active: payload.is_active }),
  });
  return { status: 200, body: { ok: true } };
}

async function publishBlogPost(ctx, payload) {
  const { databases, actor } = ctx;
  const postId = String(payload.post_id || '');
  if (!postId) return { status: 400, body: { error: 'post_id is required.' } };
  if (typeof payload.publish !== 'boolean') {
    return { status: 400, body: { error: 'publish must be a boolean.' } };
  }
  const post = await databases.getDocument(DB_ID, 'blog_posts', postId).catch(() => null);
  if (!post) return { status: 404, body: { error: 'Blog post not found.' } };

  // Publishing only toggles the public read(any) grant. Preserve every other
  // existing grant — admin update/delete and the creator's grants — so a
  // published post stays editable/deletable by admins. (The old code overwrote
  // the whole permission array, erasing those grants.)
  const publicRead = Permission.read(Role.any());
  const preserved = (post.$permissions || []).filter((p) => p !== publicRead);
  const adminUpdate = Permission.update(Role.label('admin'));
  const adminDelete = Permission.delete(Role.label('admin'));
  if (!preserved.includes(adminUpdate)) preserved.push(adminUpdate);
  if (!preserved.includes(adminDelete)) preserved.push(adminDelete);
  const permissions = payload.publish ? [...preserved, publicRead] : preserved;
  await databases.updateDocument(DB_ID, 'blog_posts', postId, {
    status: payload.publish ? 'published' : 'draft',
  }, permissions);

  await writeAudit(databases, {
    actor_email: actor.email,
    actor_role: actor.role,
    action: payload.publish ? 'blog.publish' : 'blog.unpublish',
    entity_type: 'BlogPost',
    entity_id: postId,
    before: JSON.stringify({ status: post.status }),
    after: JSON.stringify({ status: payload.publish ? 'published' : 'draft' }),
  });
  return { status: 200, body: { ok: true } };
}

// --- Entrypoint -----------------------------------------------------------------

export default async ({ req, res, error }) => {
  try {
    const accountId = callerAccountId(req);
    if (!accountId) return res.json({ error: 'Authentication required.' }, 401);

    const { databases, users } = services();
    const account = await users.get(accountId).catch(() => null);
    const labels = account?.labels || [];
    if (!labels.includes('admin') && !labels.includes('superadmin')) {
      return res.json({ error: 'Admin access required.' }, 403);
    }
    const profile = await profileForAccount(databases, accountId);
    const actor = {
      email: profile?.email || account?.email || '',
      role: labels.includes('superadmin') ? 'super_admin' : 'admin',
    };
    if (await emailIsBanned(databases, actor.email)) {
      return res.json({ error: 'Account access is restricted.' }, 403);
    }

    const ctx = { databases, users, actor, labels, error };
    const payload = body(req);
    let result;
    switch (payload.action) {
      case 'inviteUser':
        result = await inviteUser(ctx, payload);
        break;
      case 'grantCredits':
        result = await grantCredits(ctx, payload);
        break;
      case 'revokeCredits':
        result = await revokeCredits(ctx, payload);
        break;
      case 'banUser':
        result = await banUser(ctx, payload);
        break;
      case 'unbanUser':
        result = await unbanUser(ctx, payload);
        break;
      case 'linkCoachAccount':
        result = await linkCoachAccount(ctx, payload);
        break;
      case 'unlinkCoachAccount':
        result = await unlinkCoachAccount(ctx, payload);
        break;
      case 'createCoach':
        result = await createCoach(ctx, payload);
        break;
      case 'updateCoach':
        result = await updateCoach(ctx, payload);
        break;
      case 'deleteCoach':
        result = await deleteCoach(ctx, payload);
        break;
      case 'setCoachFee':
        result = await setCoachFee(ctx, payload);
        break;
      case 'setPlatformFee':
        result = await setPlatformFee(ctx, payload);
        break;
      case 'setOrgFee':
        result = await setOrgFee(ctx, payload);
        break;
      case 'setCoachActive':
        result = await setCoachActive(ctx, payload);
        break;
      case 'publishBlogPost':
        result = await publishBlogPost(ctx, payload);
        break;
      default:
        result = { status: 400, body: { error: 'Unknown action.' } };
    }
    return res.json(result.body, result.status);
  } catch (err) {
    error?.(err?.message || String(err));
    return res.json({ error: 'Admin request failed.' }, 500);
  }
};
