import { Client, Databases, Users, ID, Permission, Query, Role } from 'node-appwrite';
import { randomBytes } from 'node:crypto';

const DB_ID = process.env.APPWRITE_DATABASE_ID || 'lctraining';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MEMBER_ROLES = ['org_owner', 'org_admin', 'org_billing', 'org_coach_manager', 'org_viewer'];
const ORG_ADMIN_ROLES = ['org_owner', 'org_admin'];

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

async function callerIsBanned(databases, profile) {
  if (!profile?.email) return false;
  const rows = await databases.listDocuments(DB_ID, 'user_bans', [
    Query.equal('banned_email', profile.email),
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

async function createDocumentResilient(databases, collection, data, permissions) {
  const payload = { ...data };
  for (let i = 0; i < 12; i += 1) {
    try {
      return await databases.createDocument(DB_ID, collection, ID.unique(), payload, permissions);
    } catch (err) {
      const match = String(err?.message || '').match(/Unknown attribute:\s*"?([a-zA-Z0-9_]+)"?/);
      if (match && Object.prototype.hasOwnProperty.call(payload, match[1])) {
        delete payload[match[1]];
        continue;
      }
      throw err;
    }
  }
  return databases.createDocument(DB_ID, collection, ID.unique(), payload, permissions);
}

async function updateDocumentResilient(databases, collection, id, data) {
  const payload = { ...data };
  for (let i = 0; i < 12; i += 1) {
    if (Object.keys(payload).length === 0) return databases.getDocument(DB_ID, collection, id);
    try {
      return await databases.updateDocument(DB_ID, collection, id, payload);
    } catch (err) {
      const match = String(err?.message || '').match(/Unknown attribute:\s*"?([a-zA-Z0-9_]+)"?/);
      if (match && Object.prototype.hasOwnProperty.call(payload, match[1])) {
        delete payload[match[1]];
        continue;
      }
      throw err;
    }
  }
  return databases.updateDocument(DB_ID, collection, id, payload);
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

function bps(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 10000) return undefined;
  return n;
}

function platformFeeBps() {
  const n = Number.parseInt(process.env.PLATFORM_FEE_BPS || '1500', 10);
  return Number.isInteger(n) && n >= 0 && n <= 10000 ? n : 1500;
}

function slugify(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140) || 'organization';
}

async function uniqueSlug(databases, name) {
  const base = slugify(name);
  for (let i = 0; i < 20; i += 1) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const rows = await databases.listDocuments(DB_ID, 'organizations', [
      Query.equal('slug', candidate),
      Query.limit(1),
    ]);
    if (rows.documents.length === 0) return candidate;
  }
  return `${base}-${ID.unique().slice(0, 8)}`;
}

// Active membership row for a profile in an org (or null).
async function membership(databases, organizationId, profileId) {
  const rows = await databases.listDocuments(DB_ID, 'organization_members', [
    Query.equal('organization_id', organizationId),
    Query.equal('profile_id', profileId),
    Query.equal('status', 'active'),
    Query.limit(1),
  ]);
  return rows.documents[0] || null;
}

async function requireRole(databases, organizationId, profile, roles) {
  if (!organizationId) return null;
  const member = await membership(databases, organizationId, profile.$id);
  if (!member || !roles.includes(member.role)) return null;
  return member;
}

// Account ids of active org owners/admins — used for per-document read grants.
async function orgAdminAccountIds(databases, organizationId) {
  const members = await databases.listDocuments(DB_ID, 'organization_members', [
    Query.equal('organization_id', organizationId),
    Query.equal('status', 'active'),
    Query.equal('role', ORG_ADMIN_ROLES),
    Query.limit(50),
  ]).catch(() => ({ documents: [] }));
  const profileIds = [...new Set(members.documents.map((m) => m.profile_id))];
  if (profileIds.length === 0) return [];
  const profiles = await databases.listDocuments(DB_ID, 'profiles', [
    Query.equal('$id', profileIds),
    Query.limit(profileIds.length),
  ]).catch(() => ({ documents: [] }));
  return profiles.documents.map((p) => p.account_id).filter(Boolean);
}

function readGrants(accountIds) {
  return [...new Set(accountIds.filter(Boolean))].map((id) => Permission.read(Role.user(id)));
}

async function notify(databases, recipientProfile, type, title, text) {
  if (!recipientProfile) return;
  const grants = recipientProfile.account_id
    ? [
      Permission.read(Role.user(recipientProfile.account_id)),
      Permission.update(Role.user(recipientProfile.account_id)),
    ]
    : [];
  await databases.createDocument(DB_ID, 'notifications', ID.unique(), {
    recipient_profile_id: recipientProfile.$id,
    type,
    title,
    body: text,
    read: false,
  }, grants).catch(() => {});
}

async function profileByEmail(databases, email) {
  const rows = await databases.listDocuments(DB_ID, 'profiles', [
    Query.equal('email', email),
    Query.limit(1),
  ]);
  return rows.documents[0] || null;
}

async function ensureProfileAccount(databases, users, email, role = 'user', error) {
  let profile = await profileByEmail(databases, email);
  if (profile?.account_id) {
    const account = await users.get(profile.account_id).catch(() => null);
    if (account) return { profile, account, created: false };
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
    profile = await updateDocumentResilient(databases, 'profiles', profile.$id, {
      account_id: account.$id,
      email,
    });
  } else {
    profile = await createDocumentResilient(databases, 'profiles', {
      account_id: account.$id,
      email,
      role,
    }, [Permission.read(Role.user(account.$id))]);
  }
  return { profile, account, created: true };
}

function preservedRole(account, profile, fallback) {
  const labels = account?.labels || [];
  if (labels.includes('superadmin')) return 'super_admin';
  if (labels.includes('admin')) return 'admin';
  if (!account && ['admin', 'super_admin'].includes(profile?.role)) return profile.role;
  return fallback;
}

async function getCoachPrivate(databases, coachId) {
  const rows = await databases.listDocuments(DB_ID, 'coach_private', [
    Query.equal('coach_id', coachId),
    Query.limit(1),
  ]).catch(() => ({ documents: [] }));
  return rows.documents[0] || null;
}

async function upsertCoachPrivate(databases, coachId, fields) {
  const existing = await getCoachPrivate(databases, coachId);
  if (existing) return updateDocumentResilient(databases, 'coach_private', existing.$id, fields);
  return createDocumentResilient(databases, 'coach_private', { coach_id: coachId, ...fields });
}

async function coachByPrivateEmail(databases, email) {
  const rows = await databases.listDocuments(DB_ID, 'coach_private', [
    Query.equal('email', email),
    Query.limit(1),
  ]).catch(() => ({ documents: [] }));
  const row = rows.documents[0];
  if (!row?.coach_id) return null;
  return databases.getDocument(DB_ID, 'coaches', row.coach_id).catch(() => null);
}

async function accountOwnedCoach(databases, accountId) {
  if (!accountId) return null;
  const rows = await databases.listDocuments(DB_ID, 'coaches', [
    Query.equal('user_id', accountId),
    Query.limit(1),
  ]);
  return rows.documents[0] || null;
}

async function accountOwnsOtherCoach(databases, accountId, exceptCoachId) {
  if (!accountId) return null;
  const rows = await databases.listDocuments(DB_ID, 'coaches', [
    Query.equal('user_id', accountId),
    Query.limit(2),
  ]);
  return rows.documents.find((doc) => doc.$id !== exceptCoachId) || null;
}

async function ensureCoachForProfile(databases, users, profile, defaults = {}, error) {
  if (!profile?.account_id) return { error: 'Profile has no account to link as a coach.' };
  const preferred = defaults.coach || null;
  const linked = profile.coach_id
    ? await databases.getDocument(DB_ID, 'coaches', profile.coach_id).catch(() => null)
    : null;
  const owned = await accountOwnedCoach(databases, profile.account_id);
  const candidates = [preferred, linked, owned].filter(Boolean);
  const uniqueIds = [...new Set(candidates.map((coach) => coach.$id))];
  if (uniqueIds.length > 1) {
    return { error: 'This email is already tied to a different coach record.' };
  }

  let coach = candidates[0] || null;
  if (!coach) {
    const email = String(defaults.email || profile.email || '').trim().toLowerCase();
    const fallbackName = email ? email.split('@')[0] : 'Coach';
    coach = await createDocumentResilient(databases, 'coaches', {
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
  if (duplicate) return { error: 'This account already owns a different coach record.' };

  const account = await users.get(profile.account_id).catch(() => null);
  const updatedCoach = await updateDocumentResilient(databases, 'coaches', coach.$id, {
    user_id: profile.account_id,
  }).catch((err) => {
    error?.(`ensureCoachForProfile: failed to set coach.user_id: ${err?.message || err}`);
    return null;
  });
  await updateDocumentResilient(databases, 'profiles', profile.$id, {
    role: preservedRole(account, profile, 'coach'),
    coach_id: coach.$id,
  });
  if (account) {
    await users.updateLabels(profile.account_id, [...new Set([...(account.labels || []), 'coach'])]).catch(() => {});
  }
  const email = String(defaults.email || profile.email || '').trim().toLowerCase();
  if (email) {
    await upsertCoachPrivate(databases, coach.$id, { email }).catch((err) => {
      error?.(`ensureCoachForProfile: failed to write coach_private: ${err?.message || err}`);
    });
  }
  return { coach: updatedCoach || coach };
}

// --- Action handlers ----------------------------------------------------------

async function createOrg(databases, profile, accountId, payload) {
  const name = str(payload.name, 2, 200);
  if (name === undefined) return { status: 400, body: { error: 'name (2-200 chars) is required.' } };
  const type = str(payload.type ?? '', 0, 120);
  const description = str(payload.description ?? '', 0, 20000);
  const contactPhone = str(payload.contact_phone ?? '', 0, 30);
  const websiteUrl = str(payload.website_url ?? '', 0, 1000);
  const serviceAreaLabel = str(payload.service_area_label ?? '', 0, 500);
  const contactEmail = String(payload.contact_email || '').trim().toLowerCase();
  if ([type, description, contactPhone, websiteUrl, serviceAreaLabel].some((v) => v === undefined)) {
    return { status: 400, body: { error: 'One or more fields are invalid.' } };
  }
  if (contactEmail && !EMAIL_RE.test(contactEmail)) {
    return { status: 400, body: { error: 'contact_email is invalid.' } };
  }
  const sports = Array.isArray(payload.sports)
    ? payload.sports.map((s) => String(s || '').trim().slice(0, 60)).filter(Boolean).slice(0, 20)
    : [];

  const slug = await uniqueSlug(databases, name);
  const org = await databases.createDocument(DB_ID, 'organizations', ID.unique(), {
    name,
    slug,
    type,
    status: 'draft',
    description,
    // Default to the recommended split model so an org's coaches are paid by
    // default (the schema default 'organization' would route 100%-minus-platform
    // to the org and pay affiliated coaches $0 until an admin flips it). ORG-02.
    payout_model: 'split',
    contact_email: contactEmail || undefined,
    contact_phone: contactPhone,
    website_url: websiteUrl,
    service_area_label: serviceAreaLabel,
    primary_sports: sports.join(','),
    created_by_profile_id: profile.$id,
  });

  await databases.createDocument(DB_ID, 'organization_members', ID.unique(), {
    organization_id: org.$id,
    profile_id: profile.$id,
    role: 'org_owner',
    status: 'active',
    accepted_at: new Date().toISOString(),
  }, readGrants([accountId]));

  await databases.updateDocument(DB_ID, 'profiles', profile.$id, {
    primary_organization_id: org.$id,
  }).catch(() => {});

  return { status: 200, body: { organization: org } };
}

const ORG_UPDATE_FIELDS = {
  name: (v) => str(v, 2, 200),
  type: (v) => str(v, 0, 120),
  description: (v) => str(v, 0, 20000),
  contact_phone: (v) => str(v, 0, 30),
  website_url: (v) => str(v, 0, 1000),
  instagram_handle: (v) => str(v, 0, 80),
  service_area_label: (v) => str(v, 0, 500),
  logo_file_id: (v) => str(v, 0, 128),
  brand_color: (v) => str(v, 0, 20),
  coach_count_label: (v) => str(v, 0, 80),
  // How money flows to coaches for org-affiliated bookings:
  //   split        — platform pays coach + org their shares directly (default)
  //   organization — org receives the whole balance (minus platform fee), pays coaches itself
  //   coach        — coach is paid directly; org takes nothing
  payout_model: (v) => (['split', 'organization', 'coach'].includes(v) ? v : undefined),
};

async function updateOrg(databases, profile, payload) {
  const orgId = String(payload.organization_id || '');
  const member = await requireRole(databases, orgId, profile, ORG_ADMIN_ROLES);
  if (!member) return { status: 403, body: { error: 'Organization owner or admin access required.' } };

  const updates = {};
  for (const [key, validate] of Object.entries(ORG_UPDATE_FIELDS)) {
    if (!(key in payload)) continue;
    const value = validate(payload[key]);
    if (value === undefined) return { status: 400, body: { error: `Invalid value for ${key}.` } };
    updates[key] = value;
  }
  if ('contact_email' in payload) {
    const email = String(payload.contact_email || '').trim().toLowerCase();
    if (email && !EMAIL_RE.test(email)) return { status: 400, body: { error: 'contact_email is invalid.' } };
    updates.contact_email = email || undefined;
  }
  if ('sports' in payload) {
    if (!Array.isArray(payload.sports)) return { status: 400, body: { error: 'sports must be an array.' } };
    updates.primary_sports = payload.sports.map((s) => String(s || '').trim().slice(0, 60)).filter(Boolean).slice(0, 20).join(',');
  }
  if (Object.keys(updates).length === 0) {
    return { status: 400, body: { error: 'No updatable fields provided.' } };
  }
  const org = await databases.updateDocument(DB_ID, 'organizations', orgId, updates);
  return { status: 200, body: { organization: org } };
}

async function inviteCoach(databases, users, profile, payload, error) {
  const orgId = String(payload.organization_id || '');
  const member = await requireRole(databases, orgId, profile, ORG_ADMIN_ROLES);
  if (!member) return { status: 403, body: { error: 'Organization owner or admin access required.' } };

  let coach = null;
  let targetProfile = null;
  let createdAccount = false;
  let coachInviteEmail = '';
  if (payload.coach_id) {
    coach = await databases.getDocument(DB_ID, 'coaches', String(payload.coach_id)).catch(() => null);
  } else if (payload.email) {
    const email = String(payload.email).trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return { status: 400, body: { error: 'A valid coach email is required.' } };
    coachInviteEmail = email;
    coach = await coachByPrivateEmail(databases, email);
    const ensuredProfile = await ensureProfileAccount(databases, users, email, 'coach', error);
    if (ensuredProfile.error) return { status: 409, body: { error: ensuredProfile.error } };
    targetProfile = ensuredProfile.profile;
    createdAccount = ensuredProfile.created;
    const ensuredCoach = await ensureCoachForProfile(databases, users, targetProfile, { email, coach }, error);
    if (ensuredCoach.error) return { status: 409, body: { error: ensuredCoach.error } };
    coach = ensuredCoach.coach;
  }
  if (!coach) return { status: 404, body: { error: 'Coach not found.' } };

  const existing = await databases.listDocuments(DB_ID, 'organization_coaches', [
    Query.equal('organization_id', orgId),
    Query.equal('coach_id', coach.$id),
    Query.limit(10),
  ]);
  if (existing.documents.some((link) => ['invited', 'active'].includes(link.status))) {
    return { status: 409, body: { error: 'This coach is already invited or active in the organization.' } };
  }

  const adminAccounts = await orgAdminAccountIds(databases, orgId);
  const link = await databases.createDocument(DB_ID, 'organization_coaches', ID.unique(), {
    organization_id: orgId,
    coach_id: coach.$id,
    status: 'invited',
  }, readGrants([coach.user_id, ...adminAccounts]));

  const org = await databases.getDocument(DB_ID, 'organizations', orgId).catch(() => null);
  if (coach.user_id) {
    const coachProfile = targetProfile || await profileForAccount(databases, coach.user_id).catch(() => null);
    await notify(databases, coachProfile, 'org_invite',
      'Organization invitation',
      `${org?.name || 'An organization'} invited you to join as a coach.`);
  }
  // Coach email is PII held in the server-only coach_private collection.
  const coachPriv = await databases.listDocuments(DB_ID, 'coach_private', [
    Query.equal('coach_id', coach.$id), Query.limit(1),
  ]).then((r) => r.documents[0]).catch(() => null);
  coachInviteEmail = coachInviteEmail || coachPriv?.email || coach.email;
  if (coachInviteEmail) {
    const appBaseUrl = (process.env.APP_BASE_URL || 'http://localhost:5173').replace(/\/$/, '');
    await sendEmail({
      to: coachInviteEmail,
      subject: `LevelCoach Training - ${org?.name || 'An organization'} invited you`,
      html: `
        <p>${org?.name || 'An organization'} invited you to join their coach roster on LevelCoach Training.</p>
        <p>${createdAccount ? `Visit <a href="${appBaseUrl}">${appBaseUrl}</a>, choose "Forgot password", and enter this email address to set your password.` : 'Sign in to your coach portal'} Then accept the invitation from your coach portal.</p>
        <p>Your coach workspace is linked to this email. You still need to complete your profile, legal packet, and payouts before publishing.</p>
      `,
    }, error);
  }
  return { status: 200, body: { ok: true, org_coach_id: link.$id } };
}

async function acceptInvite(databases, accountId, payload) {
  const linkId = String(payload.org_coach_id || '');
  if (!linkId) return { status: 400, body: { error: 'org_coach_id is required.' } };
  const link = await databases.getDocument(DB_ID, 'organization_coaches', linkId).catch(() => null);
  if (!link) return { status: 404, body: { error: 'Invitation not found.' } };

  const rows = await databases.listDocuments(DB_ID, 'coaches', [
    Query.equal('user_id', accountId),
    Query.limit(1),
  ]);
  const coach = rows.documents[0];
  if (!coach || coach.$id !== link.coach_id) {
    return { status: 403, body: { error: 'This invitation is not addressed to your coach account.' } };
  }
  if (link.status !== 'invited') {
    return { status: 409, body: { error: 'This invitation can no longer be accepted.' } };
  }
  await databases.updateDocument(DB_ID, 'organization_coaches', link.$id, { status: 'active' });
  return { status: 200, body: { ok: true } };
}

async function acceptMemberInvite(databases, profile, payload) {
  const memberId = String(payload.org_member_id || '');
  if (!memberId) return { status: 400, body: { error: 'org_member_id is required.' } };
  const member = await databases.getDocument(DB_ID, 'organization_members', memberId).catch(() => null);
  if (!member || member.profile_id !== profile.$id) {
    return { status: 403, body: { error: 'This invitation is not addressed to you.' } };
  }
  if (member.status !== 'invited') {
    return { status: 409, body: { error: 'This invitation can no longer be accepted.' } };
  }
  await databases.updateDocument(DB_ID, 'organization_members', member.$id, {
    status: 'active',
    accepted_at: new Date().toISOString(),
  });
  return { status: 200, body: { ok: true } };
}

async function setCoachStatus(databases, profile, payload, status, action) {
  const orgId = String(payload.organization_id || '');
  const member = await requireRole(databases, orgId, profile, ORG_ADMIN_ROLES);
  if (!member) return { status: 403, body: { error: 'Organization owner or admin access required.' } };

  let link = null;
  if (payload.org_coach_id) {
    link = await databases.getDocument(DB_ID, 'organization_coaches', String(payload.org_coach_id)).catch(() => null);
  } else if (payload.coach_id) {
    const rows = await databases.listDocuments(DB_ID, 'organization_coaches', [
      Query.equal('organization_id', orgId),
      Query.equal('coach_id', String(payload.coach_id)),
      Query.limit(1),
    ]);
    link = rows.documents[0] || null;
  }
  if (!link || link.organization_id !== orgId) {
    return { status: 404, body: { error: 'Coach link not found in this organization.' } };
  }
  await databases.updateDocument(DB_ID, 'organization_coaches', link.$id, { status });
  await writeAudit(databases, {
    actor_email: profile.email || '',
    action,
    entity_type: 'OrganizationCoach',
    entity_id: link.$id,
    before: JSON.stringify({ status: link.status }),
    after: JSON.stringify({ status }),
    metadata: JSON.stringify({ organization_id: orgId, coach_id: link.coach_id }),
  });
  return { status: 200, body: { ok: true } };
}

async function setPayoutRule(databases, profile, payload) {
  const orgId = String(payload.organization_id || '');
  const member = await requireRole(databases, orgId, profile, ORG_ADMIN_ROLES);
  if (!member) return { status: 403, body: { error: 'Organization owner or admin access required.' } };

  const coachId = String(payload.coach_id || '');
  const coachShare = bps(payload.coach_share_bps);
  const orgShare = bps(payload.org_share_bps);
  const platformShare = platformFeeBps();
  if (!coachId) return { status: 400, body: { error: 'coach_id is required.' } };
  if (coachShare === undefined || orgShare === undefined) {
    return { status: 400, body: { error: 'coach_share_bps and org_share_bps must be non-negative integers.' } };
  }
  if (coachShare + orgShare + platformShare !== 10000) {
    return { status: 400, body: { error: `Shares must sum to 10000 basis points including the ${platformShare} bps platform fee.` } };
  }

  const links = await databases.listDocuments(DB_ID, 'organization_coaches', [
    Query.equal('organization_id', orgId),
    Query.equal('coach_id', coachId),
    Query.limit(1),
  ]);
  if (!links.documents[0]) {
    return { status: 404, body: { error: 'This coach is not linked to the organization.' } };
  }

  const coach = await databases.getDocument(DB_ID, 'coaches', coachId).catch(() => null);
  const adminAccounts = await orgAdminAccountIds(databases, orgId);
  const grants = readGrants([coach?.user_id, ...adminAccounts]);
  const data = {
    organization_id: orgId,
    coach_id: coachId,
    coach_share_bps: coachShare,
    org_share_bps: orgShare,
    platform_share_bps: platformShare,
  };
  const existing = await databases.listDocuments(DB_ID, 'payout_rules', [
    Query.equal('organization_id', orgId),
    Query.equal('coach_id', coachId),
    Query.limit(1),
  ]);
  const rule = existing.documents[0]
    ? await databases.updateDocument(DB_ID, 'payout_rules', existing.documents[0].$id, data, grants)
    : await databases.createDocument(DB_ID, 'payout_rules', ID.unique(), data, grants);

  await writeAudit(databases, {
    actor_email: profile.email || '',
    action: 'payout_rule.set',
    entity_type: 'PayoutRule',
    entity_id: rule.$id,
    before: existing.documents[0]
      ? JSON.stringify({
        coach_share_bps: existing.documents[0].coach_share_bps,
        org_share_bps: existing.documents[0].org_share_bps,
      })
      : '',
    after: JSON.stringify(data),
    metadata: JSON.stringify({ organization_id: orgId, coach_id: coachId, actor_profile_id: profile.$id }),
  });
  return { status: 200, body: { ok: true, payout_rule_id: rule.$id } };
}

async function inviteMember(databases, users, profile, payload, error) {
  const orgId = String(payload.organization_id || '');
  const member = await requireRole(databases, orgId, profile, ORG_ADMIN_ROLES);
  if (!member) return { status: 403, body: { error: 'Organization owner or admin access required.' } };

  const role = String(payload.role || 'org_viewer');
  if (!MEMBER_ROLES.includes(role)) return { status: 400, body: { error: 'Invalid member role.' } };
  if (ORG_ADMIN_ROLES.includes(role) && member.role !== 'org_owner') {
    return { status: 403, body: { error: 'Only the organization owner can grant owner or admin roles.' } };
  }

  const email = String(payload.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { status: 400, body: { error: 'A valid email is required.' } };
  const ensuredProfile = await ensureProfileAccount(databases, users, email, 'user', error);
  if (ensuredProfile.error) return { status: 409, body: { error: ensuredProfile.error } };
  const target = ensuredProfile.profile;

  const existing = await databases.listDocuments(DB_ID, 'organization_members', [
    Query.equal('organization_id', orgId),
    Query.equal('profile_id', target.$id),
    Query.limit(10),
  ]);
  if (existing.documents.some((row) => ['invited', 'active'].includes(row.status))) {
    return { status: 409, body: { error: 'This person is already invited or active in the organization.' } };
  }

  const adminAccounts = await orgAdminAccountIds(databases, orgId);
  const created = await databases.createDocument(DB_ID, 'organization_members', ID.unique(), {
    organization_id: orgId,
    profile_id: target.$id,
    role,
    status: 'invited',
    invited_by: profile.$id,
  }, readGrants([target.account_id, ...adminAccounts]));

  const org = await databases.getDocument(DB_ID, 'organizations', orgId).catch(() => null);
  await notify(databases, target, 'org_member_invite',
    'Organization invitation',
    `${org?.name || 'An organization'} invited you to join as ${role}.`);
  await sendEmail({
    to: email,
    subject: `LevelCoach Training - ${org?.name || 'An organization'} invited you`,
    html: `
      <p>${org?.name || 'An organization'} invited you to join their team on LevelCoach Training.</p>
      <p>${ensuredProfile.created ? `Visit <a href="${(process.env.APP_BASE_URL || 'http://localhost:5173').replace(/\/$/, '')}">${(process.env.APP_BASE_URL || 'http://localhost:5173').replace(/\/$/, '')}</a>, choose "Forgot password", and enter this email address to set your password.` : 'Sign in'} Then accept the invitation from your organization workspace.</p>
    `,
  }, error);

  await writeAudit(databases, {
    actor_email: profile.email || '',
    action: 'organization.invite_member',
    entity_type: 'OrganizationMember',
    entity_id: created.$id,
    after: JSON.stringify({ role, status: 'invited' }),
    metadata: JSON.stringify({ organization_id: orgId, target_profile_id: target.$id }),
  });
  return { status: 200, body: { ok: true, org_member_id: created.$id } };
}

async function countActiveOwners(databases, orgId) {
  const rows = await databases.listDocuments(DB_ID, 'organization_members', [
    Query.equal('organization_id', orgId),
    Query.equal('role', 'org_owner'),
    Query.equal('status', 'active'),
    Query.limit(100),
  ]);
  return rows.documents.length;
}

async function setMemberRole(databases, profile, payload) {
  const orgId = String(payload.organization_id || '');
  const actor = await requireRole(databases, orgId, profile, ['org_owner']);
  if (!actor) return { status: 403, body: { error: 'Only the organization owner can change member roles.' } };

  const role = String(payload.role || '');
  if (!MEMBER_ROLES.includes(role)) return { status: 400, body: { error: 'Invalid member role.' } };
  const target = await databases.getDocument(DB_ID, 'organization_members', String(payload.member_id || '')).catch(() => null);
  if (!target || target.organization_id !== orgId) {
    return { status: 404, body: { error: 'Member not found in this organization.' } };
  }
  if (target.role === 'org_owner' && role !== 'org_owner' && (await countActiveOwners(databases, orgId)) <= 1) {
    return { status: 409, body: { error: 'An organization must keep at least one owner.' } };
  }

  await databases.updateDocument(DB_ID, 'organization_members', target.$id, { role });
  await writeAudit(databases, {
    actor_email: profile.email || '',
    action: 'organization.set_member_role',
    entity_type: 'OrganizationMember',
    entity_id: target.$id,
    before: JSON.stringify({ role: target.role }),
    after: JSON.stringify({ role }),
    metadata: JSON.stringify({ organization_id: orgId, target_profile_id: target.profile_id }),
  });
  return { status: 200, body: { ok: true } };
}

async function removeMember(databases, profile, payload) {
  const orgId = String(payload.organization_id || '');
  const actor = await requireRole(databases, orgId, profile, ['org_owner']);
  if (!actor) return { status: 403, body: { error: 'Only the organization owner can remove members.' } };

  const target = await databases.getDocument(DB_ID, 'organization_members', String(payload.member_id || '')).catch(() => null);
  if (!target || target.organization_id !== orgId) {
    return { status: 404, body: { error: 'Member not found in this organization.' } };
  }
  if (target.role === 'org_owner' && target.status === 'active' && (await countActiveOwners(databases, orgId)) <= 1) {
    return { status: 409, body: { error: 'An organization must keep at least one owner.' } };
  }

  await databases.updateDocument(DB_ID, 'organization_members', target.$id, { status: 'removed' });
  await writeAudit(databases, {
    actor_email: profile.email || '',
    action: 'organization.remove_member',
    entity_type: 'OrganizationMember',
    entity_id: target.$id,
    before: JSON.stringify({ status: target.status, role: target.role }),
    after: JSON.stringify({ status: 'removed' }),
    metadata: JSON.stringify({ organization_id: orgId, target_profile_id: target.profile_id }),
  });
  return { status: 200, body: { ok: true } };
}

// --- Packages (per-organization pricing) ---------------------------------------
// An organization owns packages its affiliated coaches can offer. Mirrors the
// coach package model (coachSelf), scoped to the org: organization_id set,
// coach_id empty. price_cents is the authoritative total; duration_minutes the
// session length.

const SESSION_TYPES = ['private', 'small_group', 'team', 'evaluation', 'virtual'];
const MIN_PRICE_CENTS = 500;            // $5.00 floor
const MAX_PRICE_CENTS = 5_000_00;       // $5,000 ceiling per package

function cleanList(value, { maxItems = 20, maxLength = 120, allow = null } = {}) {
  const input = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];
  const out = [];
  for (const item of input) {
    const clean = String(item || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, maxLength);
    if (!clean) continue;
    if (allow && !allow.includes(clean)) continue;
    if (!out.includes(clean)) out.push(clean);
    if (out.length >= maxItems) break;
  }
  return out;
}

function parseDurationOptions(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeDurationOptions(value, fallbackDuration, fallbackPriceCents) {
  const rows = parseDurationOptions(value);
  const source = rows.length
    ? rows
    : [{ duration_minutes: fallbackDuration, price_cents: fallbackPriceCents }];
  const byDuration = new Map();
  for (const row of source) {
    const duration = int(row?.duration_minutes, 15, 480);
    const priceCents = int(row?.price_cents, MIN_PRICE_CENTS, MAX_PRICE_CENTS);
    if (duration === undefined || priceCents === undefined) {
      return { error: 'Each duration option needs a 15-480 minute duration and valid integer-cent price.' };
    }
    byDuration.set(duration, { duration_minutes: duration, price_cents: priceCents });
  }
  const options = [...byDuration.values()].sort((a, b) => a.duration_minutes - b.duration_minutes);
  if (!options.length) return { error: 'At least one duration option is required.' };
  return { options, primary: options[0] };
}

function packageView(doc) {
  const durationOptions = normalizeDurationOptions(
    doc.duration_options,
    Number(doc.duration_minutes) || 60,
    Number(doc.price_cents) || 0,
  ).options || [];
  return {
    id: doc.$id,
    coach_id: doc.coach_id || '',
    organization_id: doc.organization_id || '',
    name: doc.name || '',
    sessions: Number(doc.sessions) || 1,
    duration_minutes: Number(doc.duration_minutes) || 60,
    duration_options: durationOptions,
    price_cents: Number(doc.price_cents) || 0,
    session_type: doc.session_type || '',
    description: doc.description || '',
    badge: doc.badge || '',
    sport_keys: Array.isArray(doc.sport_keys) ? doc.sport_keys : [],
    location_formats: Array.isArray(doc.location_formats) ? doc.location_formats : [],
    is_active: doc.is_active !== false,
    display_order: Number(doc.display_order) || 0,
  };
}

async function listPackages(databases, profile, payload) {
  const orgId = String(payload.organization_id || '');
  const member = await requireRole(databases, orgId, profile, ORG_ADMIN_ROLES);
  if (!member) return { status: 403, body: { error: 'Organization owner or admin access required.' } };

  const rows = await databases.listDocuments(DB_ID, 'pricing_packages', [
    Query.equal('organization_id', orgId),
    Query.limit(100),
  ]).catch(() => ({ documents: [] }));
  const packages = rows.documents
    .map(packageView)
    .sort((a, b) => a.display_order - b.display_order || a.price_cents - b.price_cents);
  return { status: 200, body: { packages } };
}

async function savePackage(databases, profile, payload) {
  const orgId = String(payload.organization_id || '');
  const member = await requireRole(databases, orgId, profile, ORG_ADMIN_ROLES);
  if (!member) return { status: 403, body: { error: 'Organization owner or admin access required.' } };

  const name = str(payload.name, 1, 200);
  const sessions = int(payload.sessions, 1, 100);
  const duration = int(payload.duration_minutes, 15, 480);
  const priceCents = int(payload.price_cents, MIN_PRICE_CENTS, MAX_PRICE_CENTS);
  if (name === undefined) return { status: 400, body: { error: 'A package name is required.' } };
  if (sessions === undefined) return { status: 400, body: { error: 'Sessions must be an integer between 1 and 100.' } };
  if (duration === undefined) return { status: 400, body: { error: 'Session length must be 15–480 minutes.' } };
  if (priceCents === undefined) return { status: 400, body: { error: `Price must be between $${MIN_PRICE_CENTS / 100} and $${MAX_PRICE_CENTS / 100}.` } };
  const durationOptionsResult = normalizeDurationOptions(payload.duration_options, duration, priceCents);
  if (durationOptionsResult.error) return { status: 400, body: { error: durationOptionsResult.error } };
  const { options: durationOptions, primary } = durationOptionsResult;

  const sessionType = payload.session_type ? (SESSION_TYPES.includes(payload.session_type) ? payload.session_type : undefined) : '';
  if (sessionType === undefined) return { status: 400, body: { error: 'Invalid session type.' } };
  const description = payload.description != null ? str(payload.description, 0, 1000) ?? '' : '';
  const badge = payload.badge != null ? str(payload.badge, 0, 100) ?? '' : '';
  const displayOrder = int(payload.display_order, 0, 9999) ?? 0;
  const isActive = payload.is_active !== false;
  const sportKeys = cleanList(payload.sport_keys || payload.sports);

  const data = {
    organization_id: orgId,
    coach_id: '',
    name,
    sessions,
    duration_minutes: primary.duration_minutes,
    duration_options: JSON.stringify(durationOptions),
    price_cents: primary.price_cents,
    price: Math.round(primary.price_cents) / 100,   // legacy dollar mirror (back-compat)
    session_type: sessionType,
    description,
    badge,
    sport_keys: sportKeys,
    location_formats: [],
    display_order: displayOrder,
    is_active: isActive,
    is_visible: isActive,                  // legacy visibility mirror
  };

  let doc;
  if (payload.package_id) {
    const existing = await databases.getDocument(DB_ID, 'pricing_packages', String(payload.package_id)).catch(() => null);
    if (!existing) return { status: 404, body: { error: 'Package not found.' } };
    if ((existing.organization_id || '') !== orgId) {
      return { status: 403, body: { error: 'You can only edit your organization’s packages.' } };
    }
    doc = await updateDocumentResilient(databases, 'pricing_packages', existing.$id, data);
  } else {
    doc = await createDocumentResilient(databases, 'pricing_packages', data);
  }
  return { status: 200, body: { ok: true, package: packageView(doc) } };
}

async function deletePackage(databases, profile, payload) {
  const orgId = String(payload.organization_id || '');
  const member = await requireRole(databases, orgId, profile, ORG_ADMIN_ROLES);
  if (!member) return { status: 403, body: { error: 'Organization owner or admin access required.' } };

  const id = String(payload.package_id || '');
  if (!id) return { status: 400, body: { error: 'package_id is required.' } };
  const existing = await databases.getDocument(DB_ID, 'pricing_packages', id).catch(() => null);
  if (!existing) return { status: 404, body: { error: 'Package not found.' } };
  if ((existing.organization_id || '') !== orgId) {
    return { status: 403, body: { error: 'You can only delete your organization’s packages.' } };
  }
  await databases.deleteDocument(DB_ID, 'pricing_packages', id);
  return { status: 200, body: { ok: true } };
}

// --- Publish gate (ARCHITECTURE.md section 8) ----------------------------------

function activeRequired(template) {
  // NOTE: no second parameter — this is used as .filter(activeRequired), and
  // Array.filter passes the element INDEX as arg 2. A `now = Date.now()`
  // default param silently became now=0/1/2..., rejecting every template as
  // "not yet effective" (compared against 1970). Keep `now` internal.
  const now = Date.now();
  if (!template.required) return false;
  if (template.retired_at && new Date(template.retired_at).getTime() <= now) return false;
  if (template.effective_at && new Date(template.effective_at).getTime() > now) return false;
  return true;
}

function agreementMatchesTemplate(agreement, template) {
  if (!agreement || agreement.status !== 'signed') return false;
  if (agreement.template_id === template.$id) return true;
  return agreement.template_key === template.template_key
    && agreement.template_version === template.version
    && (!template.checksum || !agreement.template_checksum || agreement.template_checksum === template.checksum);
}

async function orgLegalPacketComplete(databases, orgId) {
  const [templateRows, agreementRows, ownerRows] = await Promise.all([
    databases.listDocuments(DB_ID, 'legal_templates', [
      Query.equal('role', ['organization', 'platform']),
      Query.equal('required', true),
      Query.limit(100),
    ]),
    databases.listDocuments(DB_ID, 'legal_agreements', [
      Query.equal('signer_role', 'organization_admin'),
      Query.equal('status', 'signed'),
      Query.limit(500),
    ]),
    databases.listDocuments(DB_ID, 'organization_members', [
      Query.equal('organization_id', orgId),
      Query.equal('role', 'org_owner'),
      Query.equal('status', 'active'),
      Query.limit(100),
    ]),
  ]);
  const ownerProfileIds = new Set(ownerRows.documents.map((m) => m.profile_id));
  const templates = templateRows.documents.filter(activeRequired);
  if (templates.length === 0) return false;
  return templates.every((template) =>
    agreementRows.documents.some((agreement) =>
      ownerProfileIds.has(agreement.signer_profile_id)
        && agreementMatchesTemplate(agreement, template)
        && (template.role === 'platform' || agreement.organization_id === orgId)
    )
  );
}

async function orgConnectReady(databases, orgId) {
  const rows = await databases.listDocuments(DB_ID, 'stripe_connected_accounts', [
    Query.equal('owner_type', 'org'),
    Query.equal('owner_id', orgId),
    Query.limit(10),
  ]).catch(() => ({ documents: [] }));
  return rows.documents.some((row) => row.charges_enabled && row.payouts_enabled);
}

async function publishOrg(databases, profile, payload) {
  const orgId = String(payload.organization_id || '');
  const actor = await requireRole(databases, orgId, profile, ['org_owner']);
  if (!actor) return { status: 403, body: { error: 'Only the organization owner can publish.' } };

  const missing = [];
  if (!(await orgLegalPacketComplete(databases, orgId))) missing.push('legal_packet');
  if (!(await orgConnectReady(databases, orgId))) missing.push('stripe_connect');
  if (missing.length > 0) {
    return { status: 400, body: { error: 'Publish requirements not met.', missing } };
  }

  const org = await databases.updateDocument(DB_ID, 'organizations', orgId, { status: 'active' });
  await writeAudit(databases, {
    actor_email: profile.email || '',
    action: 'organization.publish',
    entity_type: 'Organization',
    entity_id: orgId,
    after: JSON.stringify({ status: 'active' }),
    metadata: JSON.stringify({ actor_profile_id: profile.$id }),
  });
  return { status: 200, body: { ok: true, organization: org } };
}

// --- Entrypoint -----------------------------------------------------------------

export default async ({ req, res, error }) => {
  try {
    const accountId = callerAccountId(req);
    if (!accountId) return res.json({ error: 'Authentication required.' }, 401);

    const { databases, users } = services();
    const profile = await profileForAccount(databases, accountId);
    if (!profile) return res.json({ error: 'No profile found for this account.' }, 404);
    if (await callerIsBanned(databases, profile)) {
      return res.json({ error: 'Account access is restricted.' }, 403);
    }

    const payload = body(req);
    let result;
    switch (payload.action) {
      case 'create':
        result = await createOrg(databases, profile, accountId, payload);
        break;
      case 'update':
        result = await updateOrg(databases, profile, payload);
        break;
      case 'inviteCoach':
        result = await inviteCoach(databases, users, profile, payload, error);
        break;
      case 'acceptInvite':
        result = await acceptInvite(databases, accountId, payload);
        break;
      case 'acceptMemberInvite':
        result = await acceptMemberInvite(databases, profile, payload);
        break;
      case 'removeCoach':
        result = await setCoachStatus(databases, profile, payload, 'removed', 'organization.remove_coach');
        break;
      case 'suspendCoach':
        result = await setCoachStatus(databases, profile, payload, 'suspended', 'organization.suspend_coach');
        break;
      case 'setPayoutRule':
        result = await setPayoutRule(databases, profile, payload);
        break;
      case 'inviteMember':
        result = await inviteMember(databases, users, profile, payload, error);
        break;
      case 'setMemberRole':
        result = await setMemberRole(databases, profile, payload);
        break;
      case 'removeMember':
        result = await removeMember(databases, profile, payload);
        break;
      case 'listPackages':
        result = await listPackages(databases, profile, payload);
        break;
      case 'savePackage':
        result = await savePackage(databases, profile, payload);
        break;
      case 'deletePackage':
        result = await deletePackage(databases, profile, payload);
        break;
      case 'publish':
        result = await publishOrg(databases, profile, payload);
        break;
      default:
        result = { status: 400, body: { error: 'Unknown action.' } };
    }
    return res.json(result.body, result.status);
  } catch (err) {
    error?.(err?.message || String(err));
    return res.json({ error: 'Organization request failed.' }, 500);
  }
};
