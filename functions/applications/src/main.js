import { Client, Databases, Users, ID, Permission, Query, Role } from 'node-appwrite';

const DB_ID = process.env.APPWRITE_DATABASE_ID || 'lctraining';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUBMIT_RATE_LIMIT = 3; // per hour per email

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

// --- submit (anonymous allowed) -------------------------------------------------

async function submit(databases, req, payload) {
  // Honeypot: bots fill the hidden "website" field. Pretend success.
  if (String(payload.website || '').trim()) {
    return { status: 200, body: { ok: true } };
  }

  const firstName = str(payload.first_name, 1, 100);
  const lastName = str(payload.last_name, 1, 100);
  const email = String(payload.email || '').trim().toLowerCase();
  const phone = str(payload.phone ?? '', 0, 30);
  const background = str(payload.coaching_background, 20, 20000);
  const resumeUrl = str(payload.resume_url ?? '', 0, 1000);
  if (firstName === undefined || lastName === undefined) {
    return { status: 400, body: { error: 'first_name and last_name are required (max 100 chars).' } };
  }
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return { status: 400, body: { error: 'A valid email is required.' } };
  }
  if (phone === undefined) return { status: 400, body: { error: 'phone is invalid.' } };
  if (background === undefined) {
    return { status: 400, body: { error: 'coaching_background is required (20-20000 chars).' } };
  }
  if (resumeUrl === undefined) return { status: 400, body: { error: 'resume_url is invalid.' } };
  if (payload.background_check_consent !== true) {
    return { status: 400, body: { error: 'Background check consent is required.' } };
  }
  let dob;
  if (payload.dob) {
    const parsed = new Date(payload.dob);
    if (Number.isNaN(parsed.getTime())) return { status: 400, body: { error: 'dob is invalid.' } };
    // Coaches must be adults — enforce server-side, not just in the form
    // (the public form promises "we confirm this from your date of birth").
    const age = (Date.now() - parsed.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    if (age < 18) return { status: 400, body: { error: 'Coaches must be 18 or older.' } };
    dob = parsed.toISOString();
  }
  // Location is now free-form and nationwide (no Detroit-only county enum).
  // Accept the legacy enum value when present (back-compat) but store the
  // human-readable location + county as plain strings.
  const serviceLocation = str(payload.service_location ?? payload.service_area ?? '', 0, 200) ?? '';
  const serviceCounty = str(payload.service_county ?? payload.county ?? '', 0, 120) ?? '';

  if (await emailIsBanned(databases, email)) {
    return { status: 403, body: { error: 'Unable to submit this application.' } };
  }

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const recent = await databases.listDocuments(DB_ID, 'coach_applications', [
    Query.equal('email', email),
    Query.greaterThan('$createdAt', hourAgo),
    Query.limit(SUBMIT_RATE_LIMIT),
  ]);
  if (recent.documents.length >= SUBMIT_RATE_LIMIT) {
    return { status: 429, body: { error: 'Too many applications from this email. Try again later.' } };
  }

  // Applicants with an account get a per-document read grant on their application.
  const accountId = callerAccountId(req);
  const grants = accountId ? [Permission.read(Role.user(accountId))] : [];
  const application = await databases.createDocument(DB_ID, 'coach_applications', ID.unique(), {
    first_name: firstName,
    last_name: lastName,
    email,
    phone,
    dob,
    coaching_background: background,
    resume_url: resumeUrl,
    background_check_consent: true,
    status: 'pending',
    ...(serviceLocation ? { service_location: serviceLocation } : {}),
    ...(serviceCounty ? { service_county: serviceCounty } : {}),
  }, grants);

  return { status: 200, body: { ok: true, application_id: application.$id } };
}

// --- review (admin label) ---------------------------------------------------------

// Create a coach document, tolerating a live `coaches` collection that is
// missing newer attributes (schema drift). On an "Unknown attribute" error we
// drop that key and retry, so approval always succeeds with whatever the
// collection currently supports.
async function createCoachResilient(databases, data) {
  const payload = { ...data };
  for (let i = 0; i < 15; i += 1) {
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

// Upsert the server-only coach_private PII row (email / email_verified_at /
// phone) keyed by coach_id == coach.$id. Update the existing row, or create one.
async function upsertCoachPrivate(databases, coachId, fields) {
  const existing = await databases.listDocuments(DB_ID, 'coach_private', [
    Query.equal('coach_id', coachId),
    Query.limit(1),
  ]).catch(() => ({ documents: [] }));
  if (existing.documents[0]) {
    return databases.updateDocument(DB_ID, 'coach_private', existing.documents[0].$id, { ...fields });
  }
  return databases.createDocument(DB_ID, 'coach_private', ID.unique(), {
    coach_id: coachId,
    ...fields,
  });
}

async function linkableProfile(databases, users, email) {
  const rows = await databases.listDocuments(DB_ID, 'profiles', [
    Query.equal('email', email),
    Query.limit(1),
  ]);
  const profile = rows.documents[0];
  if (!profile?.account_id) return null;
  const account = await users.get(profile.account_id).catch(() => null);
  // Only link accounts whose email is verified — otherwise the coach record
  // stays unlinked until adminOps.linkCoachAccount or a verified sign-in.
  if (account?.emailVerification !== true) return null;
  return profile;
}

async function review(databases, users, actorProfile, actorEmail, payload, error) {
  const applicationId = String(payload.application_id || '');
  const decision = String(payload.decision || '');
  const notes = str(payload.notes ?? '', 0, 1000);
  if (!applicationId) return { status: 400, body: { error: 'application_id is required.' } };
  if (!['approve', 'reject'].includes(decision)) {
    return { status: 400, body: { error: 'decision must be approve or reject.' } };
  }
  if (notes === undefined) return { status: 400, body: { error: 'notes is too long (max 1000 chars).' } };

  const application = await databases.getDocument(DB_ID, 'coach_applications', applicationId).catch(() => null);
  if (!application) return { status: 404, body: { error: 'Application not found.' } };
  if (['accepted', 'rejected'].includes(application.status)) {
    return { status: 409, body: { error: 'This application has already been decided.' } };
  }

  if (decision === 'reject') {
    await databases.updateDocument(DB_ID, 'coach_applications', applicationId, { status: 'rejected' });
    await sendEmail({
      to: application.email,
      subject: 'LevelCoach Training - Coach application update',
      html: `
        <p>Hi ${application.first_name},</p>
        <p>Thank you for applying to coach with LevelCoach Training. After review, we are not able to move forward with your application at this time.</p>
      `,
    }, error);
    await writeAudit(databases, {
      actor_email: actorEmail,
      actor_role: actorProfile?.role === 'super_admin' ? 'super_admin' : 'admin',
      action: 'coach_application.reject',
      entity_type: 'CoachApplication',
      entity_id: applicationId,
      before: JSON.stringify({ status: application.status }),
      after: JSON.stringify({ status: 'rejected' }),
      reason: notes || '',
      metadata: JSON.stringify({ applicant_email: application.email }),
    });
    return { status: 200, body: { ok: true, status: 'rejected' } };
  }

  // Approve: create the coach record (unpublished, inactive until onboarding).
  // Email/phone are PII and live in coach_private now — not on the coach doc.
  const profile = await linkableProfile(databases, users, application.email);
  if (profile) {
    // Same invariants as adminOps linkCoachAccount/createCoach: one coach
    // record per profile, one per account (coachSelf/training resolve by
    // user_id with limit 1 — a duplicate makes resolution nondeterministic).
    if (profile.coach_id) {
      return { status: 409, body: { error: 'This applicant is already linked to a coach record.' } };
    }
    const owned = await databases.listDocuments(DB_ID, 'coaches', [
      Query.equal('user_id', profile.account_id),
      Query.limit(1),
    ]);
    if (owned.documents[0]) {
      return { status: 409, body: { error: 'This account already owns a coach record.' } };
    }
  }
  const coach = await createCoachResilient(databases, {
    first_name: application.first_name,
    last_name: application.last_name,
    ...(application.service_county ? { service_counties: [String(application.service_county).slice(0, 100)] } : {}),
    is_active: false,
    published: false,
    ...(profile ? { user_id: profile.account_id } : {}),
  });

  // Stash the coach's PII in the server-only coach_private collection. A fresh
  // approval has no verified email yet (email_verified_at: null).
  await upsertCoachPrivate(databases, coach.$id, {
    email: application.email,
    phone: application.phone || '',
    email_verified_at: null,
  }).catch((err) => {
    error?.(`approve: failed to write coach_private: ${err?.message || err}`);
  });

  if (profile) {
    // Roles stack: approving an admin's coach application must not demote
    // their profile.role — the coach grant rides on the label + coach_id.
    // Labels are the authority; profiles.role is the drift-prone fallback.
    const account = await users.get(profile.account_id).catch(() => null);
    const labels = account?.labels || [];
    const approvedRole = labels.includes('superadmin') ? 'super_admin'
      : labels.includes('admin') ? 'admin'
      : (!account && ['admin', 'super_admin'].includes(profile.role)) ? profile.role
      : 'coach';
    await databases.updateDocument(DB_ID, 'profiles', profile.$id, {
      role: approvedRole,
      coach_id: coach.$id,
    });
    if (account) {
      await users.updateLabels(profile.account_id, [...new Set([...(account.labels || []), 'coach'])]).catch(() => {});
    }
    const grants = [
      Permission.read(Role.user(profile.account_id)),
      Permission.update(Role.user(profile.account_id)),
    ];
    await databases.createDocument(DB_ID, 'notifications', ID.unique(), {
      recipient_profile_id: profile.$id,
      type: 'coach_application_approved',
      title: 'Coach application approved',
      body: 'Your coach application was approved. Complete your coach profile to get published.',
      read: false,
    }, grants).catch(() => {});
  }

  await databases.updateDocument(DB_ID, 'coach_applications', applicationId, { status: 'accepted' });
  await sendEmail({
    to: application.email,
    subject: 'LevelCoach Training - Coach application approved',
    html: `
      <p>Hi ${application.first_name},</p>
      <p>Your coach application was approved. Sign in to LevelCoach Training to complete your coach profile, sign the coach agreements, and set up payouts.</p>
    `,
  }, error);
  await writeAudit(databases, {
    actor_email: actorEmail,
    actor_role: actorProfile?.role === 'super_admin' ? 'super_admin' : 'admin',
    action: 'coach_application.approve',
    entity_type: 'CoachApplication',
    entity_id: applicationId,
    before: JSON.stringify({ status: application.status }),
    after: JSON.stringify({ status: 'accepted', coach_id: coach.$id }),
    reason: notes || '',
    metadata: JSON.stringify({
      applicant_email: application.email,
      coach_id: coach.$id,
      linked_profile_id: profile?.$id || '',
    }),
  });
  return { status: 200, body: { ok: true, status: 'accepted', coach_id: coach.$id } };
}

// --- Entrypoint -----------------------------------------------------------------

export default async ({ req, res, error }) => {
  try {
    const { databases, users } = services();
    const payload = body(req);

    if (payload.action === 'submit') {
      const result = await submit(databases, req, payload);
      return res.json(result.body, result.status);
    }

    if (payload.action === 'review') {
      const accountId = callerAccountId(req);
      if (!accountId) return res.json({ error: 'Authentication required.' }, 401);
      const account = await users.get(accountId).catch(() => null);
      const labels = account?.labels || [];
      if (!labels.includes('admin') && !labels.includes('superadmin')) {
        return res.json({ error: 'Admin access required.' }, 403);
      }
      const actorProfile = await profileForAccount(databases, accountId);
      if (await emailIsBanned(databases, actorProfile?.email || account?.email || '')) {
        return res.json({ error: 'Account access is restricted.' }, 403);
      }
      const result = await review(databases, users, actorProfile, actorProfile?.email || account?.email || '', payload, error);
      return res.json(result.body, result.status);
    }

    return res.json({ error: 'Unknown action.' }, 400);
  } catch (err) {
    error?.(err?.message || String(err));
    return res.json({ error: 'Application request failed.' }, 500);
  }
};
