import { Client, Databases, ID, Permission, Query, Role, Storage, Users } from 'node-appwrite';
import { InputFile } from 'node-appwrite/file';

const DB_ID = process.env.APPWRITE_DATABASE_ID || 'lctraining';
const PROFILE_PHOTO_BUCKET = 'client-photos';
const MAX_PROFILE_PHOTO_BYTES = 5 * 1024 * 1024;
const PROFILE_PHOTO_MIME_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const ONBOARDING_ROLES = ['athlete', 'parent', 'guardian', 'organization', 'coach_applicant'];
const MATCHING_AGE_GROUPS = ['5-8', '9-12', '13+'];
const SKILL_LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'Competitive'];
const MAX_SPORTS = 12;
const SPORT_MAX_LEN = 120;

function services() {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://nyc.cloud.appwrite.io/v1')
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);
  return { db: new Databases(client), users: new Users(client), storage: new Storage(client) };
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

async function profileForAccount(db, accountId) {
  const rows = await db.listDocuments(DB_ID, 'profiles', [
    Query.equal('account_id', accountId),
    Query.limit(1),
  ]);
  return rows.documents[0] || null;
}

// Banned check: any active user_bans row matching the profile email.
async function activeBan(db, email) {
  if (!email) return null;
  const rows = await db.listDocuments(DB_ID, 'user_bans', [
    Query.equal('banned_email', [email, String(email).toLowerCase()]),
    Query.equal('is_active', true),
    Query.limit(1),
  ]).catch(() => ({ documents: [] }));
  return rows.documents[0] || null;
}

// Update that tolerates attributes the provisioner has not rolled out yet
// (e.g. profiles.location_* / notification_prefs). Strips the unknown key
// reported by Appwrite and retries.
async function updateProfileResilient(db, profileId, data) {
  let payload = { ...data };
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (Object.keys(payload).length === 0) return db.getDocument(DB_ID, 'profiles', profileId);
    try {
      return await db.updateDocument(DB_ID, 'profiles', profileId, payload);
    } catch (err) {
      const match = /unknown attribute:?\s*"?([\w.-]+)"?/i.exec(err?.message || '');
      if (!match || !(match[1] in payload)) throw err;
      delete payload[match[1]];
    }
  }
  return db.updateDocument(DB_ID, 'profiles', profileId, payload);
}

async function updateCoachActivityResilient(db, coachId, timestamp) {
  const payload = { last_active_at: timestamp };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await db.updateDocument(DB_ID, 'coaches', coachId, payload);
    } catch (err) {
      const match = /unknown attribute:?\s*"?([\w.-]+)"?/i.exec(err?.message || '');
      if (match && match[1] === 'last_active_at') return null;
      throw err;
    }
  }
  return null;
}

async function touchLinkedCoachActivity(db, profile, accountId, error) {
  const coachIds = new Set();
  if (profile?.coach_id) coachIds.add(profile.coach_id);

  const linkedRows = await db.listDocuments(DB_ID, 'coaches', [
    Query.equal('user_id', accountId),
    Query.limit(5),
  ]).catch(() => ({ documents: [] }));
  for (const coach of linkedRows.documents || []) {
    if (coach?.$id) coachIds.add(coach.$id);
  }

  if (!coachIds.size) return;
  const timestamp = new Date().toISOString();
  await Promise.all([...coachIds].map((coachId) =>
    updateCoachActivityResilient(db, coachId, timestamp).catch((err) => {
      error?.(`Could not update coach activity for ${coachId}: ${err?.message || String(err)}`);
      return null;
    })));
}

function cleanString(value, max) {
  const text = String(value ?? '').replace(/<[^>]*>/g, '').trim();
  return text.length > max ? null : text;
}

function canonicalFileViewUrl(bucketId, fileId) {
  const endpoint = process.env.VITE_APPWRITE_ENDPOINT || process.env.APPWRITE_FUNCTION_API_ENDPOINT || 'https://nyc.cloud.appwrite.io/v1';
  const project = process.env.VITE_APPWRITE_PROJECT_ID || process.env.APPWRITE_FUNCTION_PROJECT_ID;
  const url = new URL(`${endpoint}/storage/buckets/${bucketId}/files/${fileId}/view`);
  if (project) url.searchParams.set('project', project);
  return url.toString();
}

function parseImageDataUrl(dataUrl) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/i.exec(String(dataUrl || '').trim());
  if (!match) return null;
  const mime = match[1].toLowerCase();
  const buffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  if (!buffer.length || buffer.length > MAX_PROFILE_PHOTO_BYTES) return null;
  return { mime, buffer };
}

function validIsoDate(value) {
  const ms = Date.parse(String(value || ''));
  if (!Number.isFinite(ms)) return null;
  return new Date(ms);
}

function computeIsMinor(dob) {
  const now = new Date();
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - dob.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < dob.getUTCDate())) age -= 1;
  return age < 18;
}

function splitName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: '', last: '' };
  return { first: parts[0].slice(0, 100), last: parts.slice(1).join(' ').slice(0, 100) };
}

// --- ensure: create-or-get the caller's own profile -------------------------

async function ensureProfile(db, users, accountId, res, error) {
  const account = await users.get(accountId);
  const labels = account.labels || [];
  const email = String(account.email || '').trim().toLowerCase();

  let profile = await profileForAccount(db, accountId);

  if (!profile && email) {
    const legacyRows = await db.listDocuments(DB_ID, 'profiles', [
      Query.equal('email', [email, account.email]),
      Query.limit(1),
    ]).catch(() => ({ documents: [] }));
    const legacy = legacyRows.documents[0] || null;

    if (legacy && legacy.account_id && legacy.account_id !== accountId) {
      return res.json({ error: 'This email is already associated with another account.' }, 409);
    }
    if (legacy && !legacy.account_id) {
      // Claim a legacy (pre-cutover) profile only once the email is verified.
      if (!account.emailVerification) {
        return res.json({ error: 'Verify your email address to access your existing profile.' }, 403);
      }
      const permissions = [...new Set([...(legacy.$permissions || []), Permission.read(Role.user(accountId))])];
      profile = await db.updateDocument(DB_ID, 'profiles', legacy.$id, { account_id: accountId }, permissions);
    }
  }

  if (!profile) {
    const name = splitName(account.name);
    profile = await db.createDocument(DB_ID, 'profiles', ID.unique(), {
      account_id: accountId,
      role: 'user',
      ...(email ? { email } : {}),
      first_name: name.first,
      last_name: name.last,
      onboarding_status: 'incomplete',
    }, [Permission.read(Role.user(accountId))]);
  }

  const ban = await activeBan(db, profile.email).catch((err) => {
    error?.(err?.message || String(err));
    return null;
  });

  await touchLinkedCoachActivity(db, profile, accountId, error);

  return res.json({ profile, banned: Boolean(ban), labels });
}

// --- update: whitelisted self-service profile edits --------------------------

function buildUpdates(payload, profile) {
  const updates = {};
  const fail = (message) => ({ error: message });

  const stringFields = [
    ['first_name', 100], ['last_name', 100], ['phone', 30],
    ['parent_first_name', 100], ['parent_last_name', 100],
    ['parent_phone', 30], ['parent_relationship', 100],
    ['bio', 20000], ['location_label', 500],
    ['sport_position', 100],
  ];
  for (const [field, max] of stringFields) {
    if (payload[field] === undefined) continue;
    const value = cleanString(payload[field], max);
    if (value === null) return fail(`${field} is too long (max ${max} characters).`);
    updates[field] = value;
  }

  // Self-service sport identity (athletes managing their own profile).
  if (payload.skill_level !== undefined) {
    const value = String(payload.skill_level || '').trim();
    if (value && !SKILL_LEVELS.includes(value)) return fail('skill_level is invalid.');
    // Enum attributes accept null but reject '' — clearing must be null.
    updates.skill_level = value || null;
  }

  if (payload.sports !== undefined) {
    if (!Array.isArray(payload.sports)) return fail('sports must be an array.');
    if (payload.sports.length > MAX_SPORTS) return fail(`sports allows at most ${MAX_SPORTS} entries.`);
    const cleaned = [];
    for (const entry of payload.sports) {
      const value = cleanString(entry, SPORT_MAX_LEN);
      if (value === null) return fail(`Each sport must be ${SPORT_MAX_LEN} characters or fewer.`);
      if (value) cleaned.push(value);
    }
    updates.sports = cleaned;
  }

  if (payload.parent_email !== undefined) {
    const value = String(payload.parent_email || '').trim().toLowerCase();
    if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return fail('parent_email must be a valid email address.');
    // Appwrite email attributes accept null but reject '' — clearing must be null.
    updates.parent_email = value || null;
  }

  if (payload.photo_url !== undefined) {
    const value = String(payload.photo_url || '').trim();
    if (value && (value.length > 1000 || !/^https?:\/\//i.test(value))) return fail('photo_url must be an http(s) URL.');
    updates.photo_url = value;
  }

  if (payload.dob !== undefined) {
    const dob = validIsoDate(payload.dob);
    if (!dob || dob.getTime() > Date.now() || dob.getUTCFullYear() < 1900) return fail('dob must be a valid past date.');
    updates.dob = dob.toISOString();
    updates.is_minor = computeIsMinor(dob); // always recomputed server-side
  }

  for (const [field, range] of [['location_lat', 90], ['location_lng', 180]]) {
    if (payload[field] === undefined) continue;
    const value = Number(payload[field]);
    if (!Number.isFinite(value) || Math.abs(value) > range) return fail(`${field} is out of range.`);
    updates[field] = value;
  }

  for (const field of ['matching_opted_in', 'profile_setup_complete', 'terms_accepted', 'media_release_accepted']) {
    if (payload[field] === undefined) continue;
    if (typeof payload[field] !== 'boolean') return fail(`${field} must be a boolean.`);
    updates[field] = payload[field];
  }

  if (payload.matching_age_group !== undefined) {
    if (!MATCHING_AGE_GROUPS.includes(payload.matching_age_group)) return fail('matching_age_group is invalid.');
    updates.matching_age_group = payload.matching_age_group;
  }

  if (payload.notification_prefs !== undefined) {
    let prefs = payload.notification_prefs;
    if (typeof prefs === 'string') {
      try { prefs = JSON.parse(prefs); } catch { return fail('notification_prefs must be valid JSON.'); }
    }
    if (!prefs || typeof prefs !== 'object' || Array.isArray(prefs)) return fail('notification_prefs must be a JSON object.');
    const serialized = JSON.stringify(prefs);
    if (serialized.length > 20000) return fail('notification_prefs is too large.');
    updates.notification_prefs = serialized;
  }

  if (payload.onboarding_role !== undefined) {
    if (profile.onboarding_status === 'complete') return fail('onboarding_role can no longer be changed.');
    if (!ONBOARDING_ROLES.includes(payload.onboarding_role)) return fail('onboarding_role is invalid.');
    updates.onboarding_role = payload.onboarding_role;
  }

  if (payload.onboarding_status !== undefined) {
    // Clients may only complete onboarding — never reopen or block it.
    if (payload.onboarding_status !== 'complete' || profile.onboarding_status === 'complete') {
      return fail('onboarding_status only supports the incomplete-to-complete transition.');
    }
    updates.onboarding_status = 'complete';
  }

  return { updates };
}

async function updateProfile(db, accountId, payload, res, error) {
  const profile = await profileForAccount(db, accountId);
  if (!profile) return res.json({ error: 'No profile found. Call ensure first.' }, 404);

  const ban = await activeBan(db, profile.email);
  if (ban) return res.json({ error: 'This account is suspended.' }, 403);

  const result = buildUpdates(payload, profile);
  if (result.error) return res.json({ error: result.error }, 400);
  if (Object.keys(result.updates).length === 0) {
    return res.json({ error: 'No valid fields to update.' }, 400);
  }

  const updated = await updateProfileResilient(db, profile.$id, result.updates).catch((err) => {
    error?.(err?.message || String(err));
    return null;
  });
  if (!updated) return res.json({ error: 'Could not update profile.' }, 500);

  return res.json({ profile: updated });
}

async function uploadProfilePhoto(db, storage, accountId, payload, res, error) {
  const profile = await profileForAccount(db, accountId);
  if (!profile) return res.json({ error: 'No profile found. Call ensure first.' }, 404);

  const ban = await activeBan(db, profile.email);
  if (ban) return res.json({ error: 'This account is suspended.' }, 403);

  const parsed = parseImageDataUrl(payload.image_data || payload.data_url || '');
  if (!parsed || !PROFILE_PHOTO_MIME_EXT[parsed.mime]) {
    return res.json({ error: 'Upload a JPG, PNG, or WebP image under 5 MB.' }, 400);
  }

  const ext = PROFILE_PHOTO_MIME_EXT[parsed.mime];
  const safeName = `profile-avatar-${profile.$id}.${ext}`;
  let created;
  try {
    created = await storage.createFile({
      bucketId: PROFILE_PHOTO_BUCKET,
      fileId: ID.unique(),
      file: InputFile.fromBuffer(parsed.buffer, safeName),
      permissions: [
        Permission.read(Role.user(accountId)),
        Permission.read(Role.label('admin')),
      ],
    });
  } catch (err) {
    error?.(`[accountProfile.uploadProfilePhoto] ${err?.message || err}`);
    return res.json({ error: 'Could not upload profile photo.' }, 500);
  }

  const photoUrl = canonicalFileViewUrl(PROFILE_PHOTO_BUCKET, created.$id);
  const updated = await updateProfileResilient(db, profile.$id, { photo_url: photoUrl }).catch((err) => {
    error?.(`[accountProfile.uploadProfilePhoto] profile update failed: ${err?.message || err}`);
    return null;
  });
  if (!updated) return res.json({ error: 'Photo uploaded, but profile could not be updated.' }, 500);

  return res.json({
    profile: updated,
    file_id: created.$id,
    bucket_id: PROFILE_PHOTO_BUCKET,
    url: photoUrl,
  });
}

export default async ({ req, res, error }) => {
  try {
    const accountId = callerAccountId(req);
    if (!accountId) return res.json({ error: 'Authentication required.' }, 401);

    const payload = body(req);
    const action = String(payload.action || '');
    const { db, users, storage } = services();

    if (action === 'ensure') return await ensureProfile(db, users, accountId, res, error);
    if (action === 'update') return await updateProfile(db, accountId, payload, res, error);
    if (action === 'uploadProfilePhoto') return await uploadProfilePhoto(db, storage, accountId, payload, res, error);

    return res.json({ error: 'Unknown action.' }, 400);
  } catch (err) {
    error?.(err?.message || String(err));
    return res.json({ error: 'Could not process profile request.' }, 500);
  }
};
