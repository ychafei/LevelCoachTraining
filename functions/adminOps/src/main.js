import { Client, Databases, Users, ID, Permission, Query, Role } from 'node-appwrite';
import { createHash, randomBytes } from 'node:crypto';

const DB_ID = process.env.APPWRITE_DATABASE_ID || 'lctraining';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LEGAL_TEMPLATE_ROLES = new Set(['athlete', 'guardian', 'coach', 'organization', 'admin', 'platform']);
const LEGAL_TEMPLATE_CONTENT_KEYS = ['template_key', 'role', 'version', 'title', 'body', 'jurisdiction'];

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

async function firstDocument(databases, collectionId, queries) {
  const rows = await databases.listDocuments(DB_ID, collectionId, [...queries, Query.limit(1)]).catch(() => ({ documents: [] }));
  return rows.documents[0] || null;
}

async function createDocumentResilient(databases, collectionId, data, permissions = undefined) {
  const payload = { ...data };
  for (let i = 0; i < 30; i += 1) {
    try {
      return await databases.createDocument(DB_ID, collectionId, ID.unique(), payload, permissions);
    } catch (err) {
      const match = String(err?.message || '').match(/Unknown attribute:\s*"?([a-zA-Z0-9_]+)"?/);
      if (match && Object.prototype.hasOwnProperty.call(payload, match[1])) {
        delete payload[match[1]];
        continue;
      }
      throw err;
    }
  }
  throw new Error(`Could not create ${collectionId} document.`);
}

async function updateDocumentResilient(databases, collectionId, documentId, updates) {
  const payload = { ...updates };
  for (let i = 0; i < 30; i += 1) {
    if (Object.keys(payload).length === 0) return null;
    try {
      return await databases.updateDocument(DB_ID, collectionId, documentId, payload);
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

async function guardianAccountsForAthlete(databases, athleteId) {
  if (!athleteId) return [];
  const links = await databases.listDocuments(DB_ID, 'guardian_athletes', [
    Query.equal('athlete_id', athleteId),
    Query.limit(50),
  ]).catch(() => ({ documents: [] }));
  const accounts = [];
  for (const link of links.documents) {
    const guardian = await databases.getDocument(DB_ID, 'profiles', link.guardian_profile_id).catch(() => null);
    if (guardian?.account_id) accounts.push(guardian.account_id);
  }
  return [...new Set(accounts)];
}

async function creditOwnerPermissions(databases, credit) {
  const accounts = new Set();
  if (credit.owner_account_id) accounts.add(credit.owner_account_id);
  const profileIds = [credit.client_profile_id, credit.owner_profile_id].filter(Boolean);
  for (const profileId of new Set(profileIds)) {
    const profile = await databases.getDocument(DB_ID, 'profiles', profileId).catch(() => null);
    if (profile?.account_id) accounts.add(profile.account_id);
  }
  for (const accountId of await guardianAccountsForAthlete(databases, credit.athlete_id)) {
    accounts.add(accountId);
  }
  return [...accounts].map((accountId) => Permission.read(Role.user(accountId)));
}

async function writeCreditLedger(databases, credit, entry, permissions) {
  const idempotencyKey = entry.idempotency_key || '';
  if (idempotencyKey) {
    const existing = await firstDocument(databases, 'credit_ledger_entries', [
      Query.equal('idempotency_key', idempotencyKey),
    ]);
    if (existing) return existing;
  }
  return createDocumentResilient(databases, 'credit_ledger_entries', {
    credit_id: credit.$id,
    credit_lot_id: credit.$id,
    payment_record_id: credit.source_payment_record_id || '',
    session_id: '',
    actor_profile_id: entry.actor_profile_id || '',
    client_profile_id: credit.client_profile_id || credit.owner_profile_id || '',
    owner_profile_id: credit.owner_profile_id || credit.client_profile_id || '',
    athlete_id: credit.athlete_id || '',
    type: entry.type,
    amount_cents: entry.amount_cents,
    currency: credit.currency || 'usd',
    from_coach_id: entry.from_coach_id || '',
    to_coach_id: entry.to_coach_id || '',
    organization_id: credit.original_organization_id || credit.organization_id || '',
    metadata: JSON.stringify(entry.metadata || {}),
    idempotency_key: idempotencyKey,
  }, permissions);
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

function destructiveReason(payload) {
  return str(payload.reason, 3, 1000);
}

function confirmationMatches(payload, expected) {
  return String(payload.confirmation || '').trim() === expected;
}

function sha256(value) {
  return createHash('sha256').update(String(value || '')).digest('hex');
}

function legalTemplateChecksum(template) {
  return sha256([
    template.template_key,
    template.role,
    template.version,
    template.title,
    template.body,
    template.jurisdiction || '',
  ].join('\n'));
}

function cleanTemplateKey(value) {
  const cleaned = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 160);
  return cleaned || '';
}

function isoOrUndefined(value) {
  if (value === undefined || value === null || value === '') return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return undefined;
  return date.toISOString();
}

function legalTemplatePayload(input, existing = {}) {
  const templateKey = Object.prototype.hasOwnProperty.call(input, 'template_key')
    ? cleanTemplateKey(input.template_key)
    : existing.template_key || '';
  const role = Object.prototype.hasOwnProperty.call(input, 'role')
    ? String(input.role || '').trim()
    : existing.role || '';
  const version = Object.prototype.hasOwnProperty.call(input, 'version')
    ? str(input.version, 1, 60)
    : existing.version || '';
  const title = Object.prototype.hasOwnProperty.call(input, 'title')
    ? str(input.title, 1, 300)
    : existing.title || '';
  const bodyText = Object.prototype.hasOwnProperty.call(input, 'body')
    ? str(input.body, 1, 100000)
    : existing.body || '';
  const required = Object.prototype.hasOwnProperty.call(input, 'required')
    ? input.required === true
    : existing.required !== false;
  const jurisdiction = Object.prototype.hasOwnProperty.call(input, 'jurisdiction')
    ? str(input.jurisdiction || '', 0, 120)
    : existing.jurisdiction || '';
  const effectiveAt = Object.prototype.hasOwnProperty.call(input, 'effective_at')
    ? isoOrUndefined(input.effective_at)
    : existing.effective_at || '';

  if (!templateKey) return { error: 'template_key is required.' };
  if (!LEGAL_TEMPLATE_ROLES.has(role)) return { error: 'role must be athlete, guardian, coach, organization, admin, or platform.' };
  if (!version) return { error: 'version is required.' };
  if (!title) return { error: 'title is required.' };
  if (!bodyText) return { error: 'body is required.' };
  if (effectiveAt === undefined) return { error: 'effective_at must be a valid date/time.' };
  if (jurisdiction === undefined) return { error: 'jurisdiction is too long.' };

  const payload = {
    template_key: templateKey,
    role,
    version,
    title,
    body: bodyText,
    required,
    jurisdiction,
  };
  if (effectiveAt) payload.effective_at = effectiveAt;
  return { payload: { ...payload, checksum: legalTemplateChecksum(payload) } };
}

async function templateHasSignatures(databases, templateId) {
  const row = await firstDocument(databases, 'legal_agreements', [
    Query.equal('template_id', templateId),
  ]);
  return !!row;
}

function contentChanged(existing, next) {
  return LEGAL_TEMPLATE_CONTENT_KEYS.some((key) => String(existing?.[key] ?? '') !== String(next?.[key] ?? ''));
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

// --- coach_private (server-only PII: email / email_verified_at / phone) --------

// Fetch the private PII row for a coach (keyed by coach_id == coach.$id), or
// null when none exists yet.
async function getCoachPrivate(databases, coachId) {
  const rows = await databases.listDocuments(DB_ID, 'coach_private', [
    Query.equal('coach_id', coachId),
    Query.limit(1),
  ]).catch(() => ({ documents: [] }));
  return rows.documents[0] || null;
}

// Upsert the private PII row: update the existing row, or create one. Only the
// provided fields are written.
async function upsertCoachPrivate(databases, coachId, fields) {
  const existing = await getCoachPrivate(databases, coachId);
  if (existing) {
    return databases.updateDocument(DB_ID, 'coach_private', existing.$id, { ...fields });
  }
  return databases.createDocument(DB_ID, 'coach_private', ID.unique(), {
    coach_id: coachId,
    ...fields,
  });
}

// Pull the email / phone / email_verified_at keys out of an updates object,
// returning the private subset (only keys that were present) and leaving the
// rest. Mutates `rest` by deleting the private keys.
function splitPrivateFields(source) {
  const priv = {};
  const rest = { ...source };
  for (const key of ['email', 'phone', 'email_verified_at']) {
    if (Object.prototype.hasOwnProperty.call(rest, key)) {
      priv[key] = rest[key];
      delete rest[key];
    }
  }
  return { priv, rest };
}

// Role to keep on a profile when linking/unlinking a coach record. Account
// labels are the authority (profiles.role can drift); only when the account is
// unreadable do we trust an elevated profiles.role rather than demote on stale
// info. `fallback` is 'coach' on link, 'user' on unlink/delete.
function preservedRole(account, profile, fallback) {
  const labels = account?.labels || [];
  if (labels.includes('superadmin')) return 'super_admin';
  if (labels.includes('admin')) return 'admin';
  if (!account && ['admin', 'super_admin'].includes(profile?.role)) return profile.role;
  return fallback;
}

// An account may own at most one coaches row (coachSelf/training resolve by
// user_id with limit 1 — a second row makes resolution nondeterministic).
// Fail-closed: a query error propagates (500) rather than letting a duplicate
// link through; limit(2) so the excepted record can't mask a real duplicate.
async function accountOwnsOtherCoach(databases, accountId, exceptCoachId) {
  const rows = await databases.listDocuments(DB_ID, 'coaches', [
    Query.equal('user_id', accountId),
    Query.limit(2),
  ]);
  return rows.documents.find((doc) => doc.$id !== exceptCoachId) || null;
}

async function accountOwnedCoach(databases, accountId) {
  if (!accountId) return null;
  const rows = await databases.listDocuments(DB_ID, 'coaches', [
    Query.equal('user_id', accountId),
    Query.limit(1),
  ]);
  return rows.documents[0] || null;
}

async function ensureAccountForProfile(ctx, profile, email) {
  const { databases, users, error } = ctx;
  if (profile?.account_id) {
    const existing = await users.get(profile.account_id).catch(() => null);
    if (existing) return { profile, account: existing };
  }

  const password = randomBytes(32).toString('hex');
  let account;
  try {
    account = await users.create(ID.unique(), email, undefined, password);
  } catch (err) {
    error?.(err?.message || String(err));
    return { error: 'Could not create an account for this email.' };
  }

  if (profile) {
    const updated = await databases.updateDocument(DB_ID, 'profiles', profile.$id, {
      account_id: account.$id,
      email,
    });
    return { profile: updated, account };
  }

  const created = await databases.createDocument(DB_ID, 'profiles', ID.unique(), {
    account_id: account.$id,
    email,
    role: 'user',
  }, [Permission.read(Role.user(account.$id))]);
  return { profile: created, account };
}

async function ensureCoachForProfile(ctx, profile, defaults = {}) {
  const { databases, users, error } = ctx;
  if (!profile?.account_id) return { error: 'Profile has no account to link as a coach.' };

  const linked = profile.coach_id
    ? await databases.getDocument(DB_ID, 'coaches', profile.coach_id).catch(() => null)
    : null;
  const owned = await accountOwnedCoach(databases, profile.account_id);
  if (linked && owned && linked.$id !== owned.$id) {
    return { error: 'This profile is linked to a different coach record than the account owns.' };
  }

  let coach = linked || owned || null;
  if (!coach) {
    const email = String(defaults.email || profile.email || '').trim().toLowerCase();
    const fallbackName = email ? email.split('@')[0] : 'Coach';
    coach = await createCoachResilient(databases, {
      first_name: profile.first_name || defaults.first_name || fallbackName,
      last_name: profile.last_name || defaults.last_name || '',
      is_active: false,
      published: false,
      user_id: profile.account_id,
    });
  }

  if (coach.user_id && coach.user_id !== profile.account_id) {
    return { error: 'This coach record is already linked to another account.' };
  }
  const duplicate = await accountOwnsOtherCoach(databases, profile.account_id, coach.$id);
  if (duplicate) {
    return { error: 'This account already owns a different coach record.' };
  }

  const account = await users.get(profile.account_id).catch(() => null);
  const updatedCoach = await updateCoachResilient(databases, coach.$id, {
    user_id: profile.account_id,
  }).catch((err) => {
    error?.(`ensureCoachForProfile: failed to set coach.user_id: ${err?.message || err}`);
    return null;
  });
  await databases.updateDocument(DB_ID, 'profiles', profile.$id, {
    role: preservedRole(account, profile, 'coach'),
    coach_id: coach.$id,
  });
  if (account) {
    await users.updateLabels(profile.account_id, [...new Set([...(account.labels || []), 'coach'])]).catch(() => {});
  }
  const privateFields = {};
  if (defaults.email || profile.email) privateFields.email = String(defaults.email || profile.email).trim().toLowerCase();
  if (defaults.phone !== undefined) privateFields.phone = defaults.phone || '';
  if (Object.keys(privateFields).length > 0) {
    await upsertCoachPrivate(databases, coach.$id, privateFields).catch((err) => {
      error?.(`ensureCoachForProfile: failed to write coach_private: ${err?.message || err}`);
    });
  }
  return { coach: updatedCoach || coach };
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
  let profile = existingProfiles.documents[0] || null;
  let account = null;
  let createdAccount = false;

  if (profile) {
    const ensured = await ensureAccountForProfile(ctx, profile, email);
    if (ensured.error) return { status: 409, body: { error: ensured.error } };
    profile = ensured.profile;
    account = ensured.account;
  } else {
    // Random throwaway password — the invitee sets their own via password reset.
    const password = randomBytes(32).toString('hex');
    try {
      account = await users.create(ID.unique(), email, undefined, password);
      createdAccount = true;
    } catch (err) {
      error?.(err?.message || String(err));
      return { status: 409, body: { error: 'Could not create an account for this email.' } };
    }

    profile = await databases.createDocument(DB_ID, 'profiles', ID.unique(), {
      account_id: account.$id,
      email,
      role,
    }, [Permission.read(Role.user(account.$id))]);
  }

  let coachId = '';
  if (role === 'coach') {
    const ensured = await ensureCoachForProfile(ctx, profile, { email });
    if (ensured.error) return { status: 409, body: { error: ensured.error } };
    coachId = ensured.coach?.$id || '';
  } else if (profile.role !== 'user') {
    await databases.updateDocument(DB_ID, 'profiles', profile.$id, {
      role: preservedRole(account, profile, profile.role || 'user'),
    }).catch(() => {});
  }

  const appBaseUrl = (process.env.APP_BASE_URL || 'http://localhost:5173').replace(/\/$/, '');
  await sendEmail({
    to: email,
    subject: 'LevelCoach Training - You have been invited',
    html: `
      <p>You have been invited to LevelCoach Training.</p>
      <p>Visit <a href="${appBaseUrl}">${appBaseUrl}</a>, choose "Forgot password", and enter this email address to set your password and sign in.</p>
      ${role === 'coach' ? '<p>Your coach workspace has been created and linked to this email. Complete your profile, legal packet, and payouts before publishing.</p>' : ''}
    `,
  }, error);

  await writeAudit(databases, {
    actor_email: actor.email,
    actor_role: actor.role,
    action: 'admin.invite_user',
    entity_type: 'Profile',
    entity_id: profile.$id,
    after: JSON.stringify({ email, role, coach_id: coachId }),
    metadata: JSON.stringify({ account_id: account.$id, existing_profile: !createdAccount && !!existingProfiles.documents[0] }),
  });
  return { status: 200, body: { ok: true, profile_id: profile.$id, account_id: account.$id, coach_id: coachId || undefined } };
}

async function grantCredits(ctx, payload) {
  const { databases, actor } = ctx;
  const profileId = String(payload.client_profile_id || '');
  const packageName = str(payload.package_name, 1, 200);
  const totalCredits = int(payload.total_credits, 1, 1000);
  const durationMinutes = int(payload.session_duration_minutes, 15, 480);
  const amountCents = int(payload.amount_cents ?? payload.credit_value_cents ?? 0, 0, 10000000);
  if (!profileId) return { status: 400, body: { error: 'client_profile_id is required.' } };
  if (packageName === undefined) return { status: 400, body: { error: 'package_name is required (max 200 chars).' } };
  if (totalCredits === undefined) return { status: 400, body: { error: 'total_credits must be an integer 1-1000.' } };
  if (durationMinutes === undefined) return { status: 400, body: { error: 'session_duration_minutes must be an integer 15-480.' } };
  if (amountCents === undefined) return { status: 400, body: { error: 'amount_cents must be a non-negative integer.' } };

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
    amount_cents: amountCents,
    per_session_base_price_cents: totalCredits > 0 ? Math.floor(amountCents / totalCredits) : 0,
    client_profile_id: profile.$id,
    owner_profile_id: profile.$id,
    owner_account_id: profile.account_id || '',
    currency: 'usd',
    original_amount_cents: amountCents,
    remaining_amount_cents: amountCents,
    available_amount_cents: amountCents,
    reserved_amount_cents: 0,
    spent_amount_cents: 0,
    refunded_amount_cents: 0,
    earned_amount_cents: 0,
    original_coach_id: coachId,
    original_organization_id: '',
    originating_coach_id: coachId,
    originating_organization_id: '',
    transferable: true,
    status: 'active',
    ...(coachId ? { coach_id: coachId } : {}),
  }, grants);

  await writeAudit(databases, {
    actor_email: actor.email,
    actor_role: actor.role,
    action: 'credits.grant',
    entity_type: 'SessionCredit',
    entity_id: credit.$id,
    after: JSON.stringify({ total_credits: totalCredits, session_duration_minutes: durationMinutes, amount_cents: amountCents }),
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
    remaining_amount_cents: 0,
    available_amount_cents: 0,
    reserved_amount_cents: 0,
    status: 'exhausted',
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

async function setCreditFrozenState(ctx, payload, frozen) {
  const { databases, actor } = ctx;
  const creditId = String(payload.credit_id || '');
  const reason = str(payload.reason, frozen ? 3 : 0, 1000);
  if (!creditId) return { status: 400, body: { error: 'credit_id is required.' } };
  if (reason === undefined) return { status: 400, body: { error: 'reason is required (max 1000 chars).' } };

  const credit = await databases.getDocument(DB_ID, 'session_credits', creditId).catch(() => null);
  if (!credit) return { status: 404, body: { error: 'Credit not found.' } };

  const beforeStatus = credit.status || 'active';
  const afterStatus = frozen ? 'frozen' : 'active';
  const requestId = String(payload.request_id || `${frozen ? 'freeze' : 'unfreeze'}_${creditId}_${Date.now()}`);
  const permissions = await creditOwnerPermissions(databases, credit);

  await updateDocumentResilient(databases, 'session_credits', creditId, { status: afterStatus });
  await writeCreditLedger(databases, credit, {
    type: 'admin_adjustment',
    amount_cents: 0,
    actor_profile_id: actor.profile_id || '',
    idempotency_key: `credit_${frozen ? 'freeze' : 'unfreeze'}_${creditId}_${requestId}`,
    metadata: {
      action: frozen ? 'freeze' : 'unfreeze',
      reason: reason || '',
      before_status: beforeStatus,
      after_status: afterStatus,
      request_id: requestId,
    },
  }, permissions).catch(() => {});
  await writeAudit(databases, {
    actor_email: actor.email,
    actor_role: actor.role,
    action: frozen ? 'credits.freeze' : 'credits.unfreeze',
    entity_type: 'SessionCredit',
    entity_id: creditId,
    before: JSON.stringify({ status: beforeStatus }),
    after: JSON.stringify({ status: afterStatus }),
    reason: reason || undefined,
    metadata: JSON.stringify({ client_profile_id: credit.client_profile_id || '', request_id: requestId }),
  });
  return { status: 200, body: { ok: true, status: afterStatus } };
}

async function adjustCredit(ctx, payload) {
  const { databases, actor } = ctx;
  const creditId = String(payload.credit_id || '');
  const requestedDelta = int(payload.amount_cents, -10000000, 10000000);
  const reason = str(payload.reason, 3, 1000);
  if (!creditId) return { status: 400, body: { error: 'credit_id is required.' } };
  if (requestedDelta === undefined || requestedDelta === 0) return { status: 400, body: { error: 'amount_cents must be a non-zero integer.' } };
  if (reason === undefined) return { status: 400, body: { error: 'reason is required (3-1000 chars).' } };

  const credit = await databases.getDocument(DB_ID, 'session_credits', creditId).catch(() => null);
  if (!credit) return { status: 404, body: { error: 'Credit not found.' } };
  if (credit.status === 'refunded') {
    return { status: 409, body: { error: 'Refunded credits cannot be adjusted from here.' } };
  }

  const requestId = String(payload.request_id || `adjust_${creditId}_${Date.now()}`);
  const idempotencyKey = `credit_admin_adjustment_${creditId}_${requestId}`;
  if (await firstDocument(databases, 'credit_ledger_entries', [Query.equal('idempotency_key', idempotencyKey)])) {
    return { status: 200, body: { ok: true, idempotent: true } };
  }

  const beforeRemaining = Math.max(0, Number(credit.remaining_amount_cents ?? credit.available_amount_cents ?? 0) || 0);
  const afterRemaining = Math.max(0, beforeRemaining + requestedDelta);
  const actualDelta = afterRemaining - beforeRemaining;
  if (actualDelta === 0) {
    return { status: 409, body: { error: 'This adjustment would not change the available balance.' } };
  }
  const beforeStatus = credit.status || 'active';
  const afterStatus = beforeStatus === 'frozen'
    ? 'frozen'
    : (afterRemaining > 0 || Number(credit.reserved_amount_cents) > 0 ? 'active' : 'exhausted');
  const permissions = await creditOwnerPermissions(databases, credit);

  await updateDocumentResilient(databases, 'session_credits', creditId, {
    remaining_amount_cents: afterRemaining,
    available_amount_cents: afterRemaining,
    status: afterStatus,
  });
  await writeCreditLedger(databases, credit, {
    type: 'admin_adjustment',
    amount_cents: actualDelta,
    actor_profile_id: actor.profile_id || '',
    idempotency_key: idempotencyKey,
    metadata: {
      action: 'adjust',
      reason,
      requested_delta_cents: requestedDelta,
      actual_delta_cents: actualDelta,
      before_remaining_cents: beforeRemaining,
      after_remaining_cents: afterRemaining,
      before_status: beforeStatus,
      after_status: afterStatus,
      request_id: requestId,
    },
  }, permissions);
  await writeAudit(databases, {
    actor_email: actor.email,
    actor_role: actor.role,
    action: 'credits.adjust',
    entity_type: 'SessionCredit',
    entity_id: creditId,
    before: JSON.stringify({ remaining_amount_cents: beforeRemaining, status: beforeStatus }),
    after: JSON.stringify({ remaining_amount_cents: afterRemaining, status: afterStatus }),
    reason,
    metadata: JSON.stringify({ amount_cents: actualDelta, request_id: requestId }),
  });
  return { status: 200, body: { ok: true, amount_cents: actualDelta, remaining_amount_cents: afterRemaining } };
}

async function restoreCredit(ctx, payload) {
  const { databases, actor } = ctx;
  const creditId = String(payload.credit_id || '');
  const amountCents = int(payload.amount_cents, 1, 10000000);
  const reason = str(payload.reason, 3, 1000);
  if (!creditId) return { status: 400, body: { error: 'credit_id is required.' } };
  if (amountCents === undefined) return { status: 400, body: { error: 'amount_cents must be a positive integer.' } };
  if (reason === undefined) return { status: 400, body: { error: 'reason is required (3-1000 chars).' } };

  const credit = await databases.getDocument(DB_ID, 'session_credits', creditId).catch(() => null);
  if (!credit) return { status: 404, body: { error: 'Credit not found.' } };
  if (credit.status === 'refunded') {
    return { status: 409, body: { error: 'Refunded credits cannot be restored from here.' } };
  }

  const requestId = String(payload.request_id || `restore_${creditId}_${Date.now()}`);
  const idempotencyKey = `credit_manual_restore_${creditId}_${requestId}`;
  if (await firstDocument(databases, 'credit_ledger_entries', [Query.equal('idempotency_key', idempotencyKey)])) {
    return { status: 200, body: { ok: true, idempotent: true } };
  }

  const beforeRemaining = Math.max(0, Number(credit.remaining_amount_cents ?? credit.available_amount_cents ?? 0) || 0);
  const afterRemaining = beforeRemaining + amountCents;
  const beforeStatus = credit.status || 'active';
  const afterStatus = beforeStatus === 'frozen' ? 'frozen' : 'active';
  const permissions = await creditOwnerPermissions(databases, credit);

  await updateDocumentResilient(databases, 'session_credits', creditId, {
    remaining_amount_cents: afterRemaining,
    available_amount_cents: afterRemaining,
    status: afterStatus,
  });
  await writeCreditLedger(databases, credit, {
    type: 'restore',
    amount_cents: amountCents,
    actor_profile_id: actor.profile_id || '',
    idempotency_key: idempotencyKey,
    metadata: {
      action: 'manual_restore',
      reason,
      before_remaining_cents: beforeRemaining,
      after_remaining_cents: afterRemaining,
      before_status: beforeStatus,
      after_status: afterStatus,
      request_id: requestId,
    },
  }, permissions);
  await writeAudit(databases, {
    actor_email: actor.email,
    actor_role: actor.role,
    action: 'credits.restore',
    entity_type: 'SessionCredit',
    entity_id: creditId,
    before: JSON.stringify({ remaining_amount_cents: beforeRemaining, status: beforeStatus }),
    after: JSON.stringify({ remaining_amount_cents: afterRemaining, status: afterStatus }),
    reason,
    metadata: JSON.stringify({ amount_cents: amountCents, request_id: requestId }),
  });
  return { status: 200, body: { ok: true, amount_cents: amountCents, remaining_amount_cents: afterRemaining } };
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

  // Guards: one account per coach record, one coach record per account.
  if (coach.user_id && coach.user_id !== profile.account_id) {
    return { status: 409, body: { error: 'This coach record is already linked to another account.' } };
  }
  if (profile.coach_id && profile.coach_id !== coachId) {
    return { status: 409, body: { error: 'This profile is already linked to a different coach record.' } };
  }
  if (await accountOwnsOtherCoach(databases, profile.account_id, coachId)) {
    return { status: 409, body: { error: 'This account already owns a different coach record.' } };
  }

  const account = await users.get(profile.account_id).catch(() => null);
  await databases.updateDocument(DB_ID, 'coaches', coachId, { user_id: profile.account_id });
  // Roles stack: linking a coach record must not demote a platform admin's
  // profile.role (the highest role wins for display; the coach grant lives in
  // the account label + coach_id link).
  await databases.updateDocument(DB_ID, 'profiles', profileId, { role: preservedRole(account, profile, 'coach'), coach_id: coachId });
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
  const account = accountId ? await users.get(accountId).catch(() => null) : null;

  await databases.updateDocument(DB_ID, 'coaches', coachId, { user_id: '' }).catch(() => {});
  if (profile) {
    // Keep a stacked admin's role intact — only a plain coach demotes to user.
    await databases.updateDocument(DB_ID, 'profiles', profile.$id, { role: preservedRole(account, profile, 'user'), coach_id: '' }).catch(() => {});
  }
  // Strip the coach label from every account that was tied to this record
  // (profile link and user_id link can diverge).
  for (const id of new Set([profile?.account_id, coach.user_id].filter(Boolean))) {
    const acc = id === accountId ? account : await users.get(id).catch(() => null);
    if (acc) {
      await users.updateLabels(id, (acc.labels || []).filter((l) => l !== 'coach')).catch(() => {});
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
  const { databases, users, actor } = ctx;
  const fields = payload.fields;
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
    return { status: 400, body: { error: 'fields must be an object (coach document body).' } };
  }

  // PII (email / phone / email_verified_at) lives in coach_private now — strip
  // it from the coach document body and write it to the private row instead.
  const { priv, rest } = splitPrivateFields(fields);

  // Resolve and validate the optional profile link BEFORE creating anything:
  // a profile links to at most one coach, an account owns at most one record.
  const profileId = str(payload.profile_id ?? '', 0, 64);
  let profile = null;
  if (profileId) {
    profile = await databases.getDocument(DB_ID, 'profiles', profileId).catch(() => null);
    if (!profile) return { status: 404, body: { error: 'Profile not found.' } };
    if (profile.coach_id) {
      return { status: 409, body: { error: 'This profile is already linked to a coach record.' } };
    }
    if (profile.account_id && await accountOwnsOtherCoach(databases, profile.account_id, '')) {
      return { status: 409, body: { error: 'This account already owns a coach record.' } };
    }
  }

  let coach;
  try {
    coach = await createCoachResilient(databases, { ...rest });
  } catch (err) {
    ctx.error?.(err?.message || String(err));
    return { status: 500, body: { error: 'Could not create the coach record.' } };
  }

  if (Object.keys(priv).length > 0) {
    await upsertCoachPrivate(databases, coach.$id, priv).catch((err) => {
      ctx.error?.(`createCoach: failed to write coach_private: ${err?.message || err}`);
    });
  }

  // Optionally link the new coach to the validated profile. This is a FULL
  // link (same semantics as linkCoachAccount): reverse user_id link, coach
  // label, and role — a half-link (coach_id only) leaves the person unable to
  // pass any server-side coach gate.
  if (profile?.account_id) {
    const account = await users.get(profile.account_id).catch(() => null);
    await databases.updateDocument(DB_ID, 'coaches', coach.$id, { user_id: profile.account_id }).catch((err) => {
      ctx.error?.(`createCoach: failed to set coach.user_id: ${err?.message || err}`);
    });
    await databases.updateDocument(DB_ID, 'profiles', profileId, { coach_id: coach.$id, role: preservedRole(account, profile, 'coach') }).catch((err) => {
      ctx.error?.(`createCoach: failed to set profile.coach_id: ${err?.message || err}`);
    });
    if (account) {
      await users.updateLabels(profile.account_id, [...new Set([...(account.labels || []), 'coach'])]).catch(() => {});
    }
  } else if (profile) {
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

  // Route PII (email / phone / email_verified_at) to coach_private and strip it
  // from the coaches update.
  const { priv, rest } = splitPrivateFields(updates);
  if (rest.is_active === false) rest.published = false;
  if (Object.keys(priv).length > 0) {
    await upsertCoachPrivate(databases, coachId, priv).catch((err) => {
      ctx.error?.(`updateCoach: failed to write coach_private: ${err?.message || err}`);
    });
  }

  let updated = coach;
  if (Object.keys(rest).length > 0) {
    try {
      updated = await updateCoachResilient(databases, coachId, { ...rest }) || coach;
    } catch (err) {
      ctx.error?.(err?.message || String(err));
      return { status: 500, body: { error: 'Could not update the coach record.' } };
    }
  }

  await writeAudit(databases, {
    actor_email: actor.email,
    actor_role: actor.role,
    action: 'coach.update',
    entity_type: 'Coach',
    entity_id: coachId,
    after: JSON.stringify({ keys: Object.keys(updates) }),
  });
  return { status: 200, body: { ok: true, coach: updated } };
}

// Admin/superadmin-gated (entrypoint enforces it like every other adminOps
// action). Returns the coach's contact PII for the admin edit screen, read
// private-first from coach_private with a fallback to any legacy value still on
// the coach doc.
async function getCoachContact(ctx, payload) {
  const { databases } = ctx;
  const coachId = String(payload.coach_id || '');
  if (!coachId) return { status: 400, body: { error: 'coach_id is required.' } };

  const coach = await databases.getDocument(DB_ID, 'coaches', coachId).catch(() => null);
  if (!coach) return { status: 404, body: { error: 'Coach not found.' } };

  const priv = await getCoachPrivate(databases, coachId);
  return {
    status: 200,
    body: {
      ok: true,
      email: priv?.email ?? coach.email ?? '',
      phone: priv?.phone ?? coach.phone ?? '',
      email_verified_at: priv?.email_verified_at ?? coach.email_verified_at ?? null,
    },
  };
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
  const linkedAccountId = profile?.account_id || coach.user_id || '';
  const linkedAccount = linkedAccountId ? await ctx.users.get(linkedAccountId).catch(() => null) : null;
  if (profile) {
    // Same cleanup as unlinkCoachAccount: drop the link, demote a plain coach
    // to user (never an admin), and remove the now-orphaned coach label.
    await databases.updateDocument(DB_ID, 'profiles', profile.$id, { coach_id: '', role: preservedRole(linkedAccount, profile, 'user') }).catch((err) => {
      ctx.error?.(`deleteCoach: failed to clear profile.coach_id: ${err?.message || err}`);
    });
  }
  for (const id of new Set([profile?.account_id, coach.user_id].filter(Boolean))) {
    const acc = id === linkedAccountId ? linkedAccount : await ctx.users.get(id).catch(() => null);
    if (acc) {
      await ctx.users.updateLabels(id, (acc.labels || []).filter((l) => l !== 'coach')).catch(() => {});
    }
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

  const updates = payload.is_active
    ? { is_active: true }
    : { is_active: false, published: false };
  await updateCoachResilient(databases, coachId, updates);
  await writeAudit(databases, {
    actor_email: actor.email,
    actor_role: actor.role,
    action: 'coach.set_active',
    entity_type: 'Coach',
    entity_id: coachId,
    before: JSON.stringify({ is_active: coach.is_active }),
    after: JSON.stringify(updates),
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

async function createLegalTemplate(ctx, payload) {
  const { databases, actor } = ctx;
  const input = payload.template && typeof payload.template === 'object'
    ? payload.template
    : payload;
  const result = legalTemplatePayload(input);
  if (result.error) return { status: 400, body: { error: result.error } };

  const template = await databases.createDocument(DB_ID, 'legal_templates', ID.unique(), {
    ...result.payload,
    effective_at: result.payload.effective_at || new Date().toISOString(),
  });

  await writeAudit(databases, {
    actor_email: actor.email,
    actor_role: actor.role,
    action: 'legal_template.create',
    entity_type: 'LegalTemplate',
    entity_id: template.$id,
    after: JSON.stringify({
      template_key: template.template_key,
      role: template.role,
      version: template.version,
      required: template.required,
      checksum: template.checksum,
    }),
  });
  return { status: 200, body: { ok: true, template } };
}

async function updateLegalTemplate(ctx, payload) {
  const { databases, actor } = ctx;
  const templateId = String(payload.template_id || payload.id || '');
  const updates = payload.updates && typeof payload.updates === 'object'
    ? payload.updates
    : payload.template && typeof payload.template === 'object'
      ? payload.template
      : {};
  if (!templateId) return { status: 400, body: { error: 'template_id is required.' } };
  if (!updates || Array.isArray(updates) || Object.keys(updates).length === 0) {
    return { status: 400, body: { error: 'updates must include at least one field.' } };
  }

  const existing = await databases.getDocument(DB_ID, 'legal_templates', templateId).catch(() => null);
  if (!existing) return { status: 404, body: { error: 'Legal template not found.' } };

  const result = legalTemplatePayload(updates, existing);
  if (result.error) return { status: 400, body: { error: result.error } };

  const hasSignatures = await templateHasSignatures(databases, templateId);
  const createsNewVersion = hasSignatures && contentChanged(existing, result.payload);
  if (createsNewVersion) {
    if (String(result.payload.version || '') === String(existing.version || '')) {
      return {
        status: 409,
        body: {
          error: 'This template already has signatures. Change the version before saving a text/title/role update so prior signed records stay immutable.',
        },
      };
    }
    const newTemplate = await databases.createDocument(DB_ID, 'legal_templates', ID.unique(), {
      ...result.payload,
      effective_at: result.payload.effective_at || new Date().toISOString(),
    });
    const retiredAt = new Date().toISOString();
    await updateDocumentResilient(databases, 'legal_templates', templateId, { retired_at: retiredAt }).catch(() => {});
    await writeAudit(databases, {
      actor_email: actor.email,
      actor_role: actor.role,
      action: 'legal_template.new_version',
      entity_type: 'LegalTemplate',
      entity_id: newTemplate.$id,
      before: JSON.stringify({
        template_id: templateId,
        template_key: existing.template_key,
        version: existing.version,
        checksum: existing.checksum,
      }),
      after: JSON.stringify({
        template_id: newTemplate.$id,
        template_key: newTemplate.template_key,
        version: newTemplate.version,
        checksum: newTemplate.checksum,
        retired_previous_at: retiredAt,
      }),
    });
    return { status: 200, body: { ok: true, template: newTemplate, created_new_version: true, retired_template_id: templateId } };
  }

  const updated = await updateDocumentResilient(databases, 'legal_templates', templateId, {
    ...result.payload,
    effective_at: result.payload.effective_at || existing.effective_at || new Date().toISOString(),
  });
  await writeAudit(databases, {
    actor_email: actor.email,
    actor_role: actor.role,
    action: 'legal_template.update',
    entity_type: 'LegalTemplate',
    entity_id: templateId,
    before: JSON.stringify({
      template_key: existing.template_key,
      role: existing.role,
      version: existing.version,
      required: existing.required,
      checksum: existing.checksum,
    }),
    after: JSON.stringify({
      template_key: updated?.template_key || result.payload.template_key,
      role: updated?.role || result.payload.role,
      version: updated?.version || result.payload.version,
      required: updated?.required ?? result.payload.required,
      checksum: updated?.checksum || result.payload.checksum,
    }),
  });
  return { status: 200, body: { ok: true, template: updated || { ...existing, ...result.payload } } };
}

async function retireLegalTemplate(ctx, payload) {
  const { databases, actor } = ctx;
  const templateId = String(payload.template_id || payload.id || '');
  if (!templateId) return { status: 400, body: { error: 'template_id is required.' } };
  const reason = destructiveReason(payload);
  if (!reason) return { status: 400, body: { error: 'reason is required (3-1000 chars).' } };
  if (!confirmationMatches(payload, 'RETIRE')) {
    return { status: 400, body: { error: 'Type RETIRE to confirm this legal template retirement.' } };
  }
  const template = await databases.getDocument(DB_ID, 'legal_templates', templateId).catch(() => null);
  if (!template) return { status: 404, body: { error: 'Legal template not found.' } };
  const retiredAt = template.retired_at || new Date().toISOString();
  await updateDocumentResilient(databases, 'legal_templates', templateId, { retired_at: retiredAt });
  await writeAudit(databases, {
    actor_email: actor.email,
    actor_role: actor.role,
    action: 'legal_template.retire',
    entity_type: 'LegalTemplate',
    entity_id: templateId,
    before: JSON.stringify({ retired_at: template.retired_at || '' }),
    after: JSON.stringify({ retired_at: retiredAt }),
    metadata: JSON.stringify({ reason, template_key: template.template_key || '', version: template.version || '' }),
  });
  return { status: 200, body: { ok: true, retired_at: retiredAt } };
}

async function deleteLegalTemplate(ctx, payload) {
  const { databases, actor } = ctx;
  const templateId = String(payload.template_id || payload.id || '');
  if (!templateId) return { status: 400, body: { error: 'template_id is required.' } };
  const reason = destructiveReason(payload);
  if (!reason) return { status: 400, body: { error: 'reason is required (3-1000 chars).' } };
  if (!confirmationMatches(payload, 'DELETE')) {
    return { status: 400, body: { error: 'Type DELETE to confirm this legal template deletion.' } };
  }
  const template = await databases.getDocument(DB_ID, 'legal_templates', templateId).catch(() => null);
  if (!template) return { status: 404, body: { error: 'Legal template not found.' } };
  if (await templateHasSignatures(databases, templateId)) {
    return {
      status: 409,
      body: {
        error: 'This legal document has signed agreements. Retire it instead so signed records stay available.',
      },
    };
  }

  await databases.deleteDocument(DB_ID, 'legal_templates', templateId);
  await writeAudit(databases, {
    actor_email: actor.email,
    actor_role: actor.role,
    action: 'legal_template.delete',
    entity_type: 'LegalTemplate',
    entity_id: templateId,
    before: JSON.stringify({
      template_key: template.template_key,
      role: template.role,
      version: template.version,
      title: template.title,
      checksum: template.checksum,
      retired_at: template.retired_at || '',
    }),
    metadata: JSON.stringify({ reason, template_key: template.template_key || '', version: template.version || '' }),
  });
  return { status: 200, body: { ok: true, deleted_template_id: templateId } };
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
      profile_id: profile?.$id || '',
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
      case 'freezeCredit':
        result = await setCreditFrozenState(ctx, payload, true);
        break;
      case 'unfreezeCredit':
        result = await setCreditFrozenState(ctx, payload, false);
        break;
      case 'adjustCredit':
        result = await adjustCredit(ctx, payload);
        break;
      case 'restoreCredit':
        result = await restoreCredit(ctx, payload);
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
      case 'getCoachContact':
        result = await getCoachContact(ctx, payload);
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
      case 'createLegalTemplate':
        result = await createLegalTemplate(ctx, payload);
        break;
      case 'updateLegalTemplate':
        result = await updateLegalTemplate(ctx, payload);
        break;
      case 'retireLegalTemplate':
        result = await retireLegalTemplate(ctx, payload);
        break;
      case 'deleteLegalTemplate':
        result = await deleteLegalTemplate(ctx, payload);
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
