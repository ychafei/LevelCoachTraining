import { Client, Databases, ID, Permission, Query, Role, Users } from 'node-appwrite';

const DB_ID = process.env.APPWRITE_DATABASE_ID || 'lctraining';
const GUARDIAN_ROLES = ['parent', 'guardian'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function services() {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://nyc.cloud.appwrite.io/v1')
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);
  return { db: new Databases(client), users: new Users(client) };
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

async function activeBan(db, email) {
  if (!email) return null;
  const rows = await db.listDocuments(DB_ID, 'user_bans', [
    Query.equal('banned_email', [email, String(email).toLowerCase()]),
    Query.equal('is_active', true),
    Query.limit(1),
  ]).catch(() => ({ documents: [] }));
  return rows.documents[0] || null;
}

function cleanText(value, max) {
  return String(value ?? '').replace(/<[^>]*>/g, '').trim().slice(0, max);
}

function cleanEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function ageFromDob(dob) {
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - birth.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age;
}

function parsePassword(value) {
  const password = String(value || '');
  if (password.length < 8) return { error: 'Player login password must be at least 8 characters.' };
  if (password.length > 256) return { error: 'Player login password is too long.' };
  return { password };
}

async function callerGuardianLinks(db, profileId) {
  const rows = await db.listDocuments(DB_ID, 'guardian_athletes', [
    Query.equal('guardian_profile_id', profileId),
    Query.limit(100),
  ]).catch(() => ({ documents: [] }));
  return rows.documents;
}

// Caller must be a parent/guardian by onboarding role, or already hold links.
async function isGuardianCaller(db, profile) {
  if (GUARDIAN_ROLES.includes(profile.onboarding_role)) return true;
  const links = await callerGuardianLinks(db, profile.$id);
  return links.length > 0;
}

async function guardianLinkFor(db, guardianProfileId, athleteId) {
  const rows = await db.listDocuments(DB_ID, 'guardian_athletes', [
    Query.equal('guardian_profile_id', guardianProfileId),
    Query.equal('athlete_id', athleteId),
    Query.limit(1),
  ]).catch(() => ({ documents: [] }));
  return rows.documents[0] || null;
}

async function audit(db, profile, action, entityType, entityId, after) {
  await db.createDocument(DB_ID, 'audit_logs', ID.unique(), {
    actor_email: profile.email || '',
    action,
    entity_type: entityType,
    entity_id: entityId,
    after: JSON.stringify(after || {}),
    metadata: JSON.stringify({ actor_profile_id: profile.$id }),
  }).catch(() => {});
}

// --- Child field validation -------------------------------------------------

function buildChildFields(payload, { requireCore = false } = {}) {
  const fail = (message) => ({ error: message });
  const fields = {};

  for (const name of ['first_name', 'last_name']) {
    if (payload[name] !== undefined || requireCore) {
      const value = cleanText(payload[name], 100);
      if (!value) return fail(`${name} is required (max 100 characters).`);
      fields[name] = value;
    }
  }

  if (payload.dob !== undefined || requireCore) {
    const ms = Date.parse(String(payload.dob || ''));
    if (!Number.isFinite(ms) || ms > Date.now() || new Date(ms).getUTCFullYear() < 1900) {
      return fail('dob is required and must be a valid past date.');
    }
    fields.dob = new Date(ms).toISOString();
  }

  if (payload.sports !== undefined) {
    if (!Array.isArray(payload.sports) || payload.sports.length > 10) {
      return fail('sports must be an array of up to 10 sport names.');
    }
    const sports = payload.sports.map((sport) => cleanText(sport, 120)).filter(Boolean);
    if (sports.length !== payload.sports.length) return fail('sports entries must be non-empty strings.');
    fields.sports = sports;
  }

  if (payload.skill_level !== undefined) fields.skill_level = cleanText(payload.skill_level, 100);
  if (payload.preferred_name !== undefined) fields.preferred_name = cleanText(payload.preferred_name, 100);
  if (payload.sport_position !== undefined) fields.sport_position = cleanText(payload.sport_position, 100);
  if (payload.training_goals !== undefined) fields.training_goals = cleanText(payload.training_goals, 20000);
  if (payload.location_label !== undefined) fields.location_label = cleanText(payload.location_label, 500);
  if (payload.health_notes !== undefined) fields.health_notes = cleanText(payload.health_notes, 20000);

  if (payload.emergency_contact !== undefined) {
    let contact = payload.emergency_contact;
    if (typeof contact === 'string' && contact) {
      try { contact = JSON.parse(contact); } catch { return fail('emergency_contact must be valid JSON.'); }
    }
    if (contact && (typeof contact !== 'object' || Array.isArray(contact))) {
      return fail('emergency_contact must be a JSON object.');
    }
    const serialized = contact ? JSON.stringify(contact) : '';
    if (serialized.length > 20000) return fail('emergency_contact is too large.');
    fields.emergency_contact = serialized;
  }

  return { fields };
}

// --- Actions ------------------------------------------------------------------

async function profileForEmail(db, email) {
  if (!email) return null;
  const rows = await db.listDocuments(DB_ID, 'profiles', [
    Query.equal('email', email),
    Query.limit(1),
  ]).catch(() => ({ documents: [] }));
  return rows.documents[0] || null;
}

async function createChildLogin(db, users, accountId, guardianProfile, payload, childFields) {
  if (payload.create_child_account !== true) return { childProfile: null, childAccountId: '' };

  const age = ageFromDob(childFields.dob);
  if (age === null) return { error: 'Date of birth is required before creating a player login.' };
  if (age < 13) {
    return {
      error: 'Player login accounts are available for athletes 13 or older. You can still manage younger athletes from your parent account.',
    };
  }

  const email = cleanEmail(payload.child_email);
  if (!EMAIL_RE.test(email) || email.length > 254) return { error: 'Enter a valid player email address.' };
  if (email === cleanEmail(guardianProfile.email)) {
    return { error: 'Use a different email for the player login. Parent and player accounts cannot share one email.' };
  }
  if (await profileForEmail(db, email)) return { error: 'A LevelCoach account already exists for this player email.' };

  const passwordResult = parsePassword(payload.child_password);
  if (passwordResult.error) return passwordResult;

  let account;
  try {
    account = await users.create(ID.unique(), email, undefined, passwordResult.password);
  } catch (err) {
    if (err?.code === 409 || /already exists/i.test(err?.message || '')) {
      return { error: 'A LevelCoach account already exists for this player email.' };
    }
    throw err;
  }

  const permissions = [
    Permission.read(Role.user(accountId)),
    Permission.read(Role.user(account.$id)),
  ];
  const childProfile = await db.createDocument(DB_ID, 'profiles', ID.unique(), {
    account_id: account.$id,
    role: 'user',
    email,
    first_name: childFields.first_name,
    last_name: childFields.last_name,
    dob: childFields.dob,
    is_minor: age < 18,
    parent_first_name: guardianProfile.first_name || '',
    parent_last_name: guardianProfile.last_name || '',
    parent_email: guardianProfile.email || '',
    parent_phone: guardianProfile.phone || '',
    parent_relationship: cleanText(payload.relationship, 100) || 'parent',
    sports: childFields.sports || [],
    ...(childFields.skill_level ? { skill_level: childFields.skill_level } : {}),
    sport_position: childFields.sport_position || '',
    location_label: childFields.location_label || '',
    profile_setup_complete: true,
    onboarding_role: 'athlete',
    onboarding_status: 'complete',
  }, permissions);

  return { childProfile, childAccountId: account.$id };
}

async function addChild(db, users, accountId, profile, payload, res) {
  if (!(await isGuardianCaller(db, profile))) {
    return res.json({ error: 'Parent or guardian role required.' }, 403);
  }

  const result = buildChildFields(payload, { requireCore: true });
  if (result.error) return res.json({ error: result.error }, 400);

  const childLogin = await createChildLogin(db, users, accountId, profile, payload, result.fields);
  if (childLogin.error) return res.json({ error: childLogin.error }, 400);

  const athletePermissions = [
    Permission.read(Role.user(accountId)),
    ...(childLogin.childAccountId ? [Permission.read(Role.user(childLogin.childAccountId))] : []),
  ];
  const athlete = await db.createDocument(DB_ID, 'athlete_profiles', ID.unique(), {
    parent_profile_id: profile.$id,
    ...(childLogin.childProfile ? { profile_id: childLogin.childProfile.$id } : {}),
    ...result.fields,
  }, athletePermissions);

  const linkPermissions = [
    Permission.read(Role.user(accountId)),
    ...(childLogin.childAccountId ? [Permission.read(Role.user(childLogin.childAccountId))] : []),
  ];
  const link = await db.createDocument(DB_ID, 'guardian_athletes', ID.unique(), {
    guardian_profile_id: profile.$id,
    athlete_id: athlete.$id,
    relationship: cleanText(payload.relationship, 100) || 'parent',
    authority_attested_at: new Date().toISOString(),
    can_book: true,
    can_pay: true,
    can_message: true,
  }, linkPermissions);

  await audit(db, profile, 'family.add_child', 'AthleteProfile', athlete.$id, {
    guardian_profile_id: profile.$id,
    link_id: link.$id,
    child_profile_id: childLogin.childProfile?.$id || '',
    child_login_created: Boolean(childLogin.childProfile),
  });

  return res.json({ athlete, link, child_profile: childLogin.childProfile || null });
}

async function updateChild(db, profile, payload, res) {
  const athleteId = String(payload.athlete_id || '').trim();
  if (!athleteId) return res.json({ error: 'athlete_id is required.' }, 400);

  const athlete = await db.getDocument(DB_ID, 'athlete_profiles', athleteId).catch(() => null);
  if (!athlete) return res.json({ error: 'Athlete not found.' }, 404);

  const link = await guardianLinkFor(db, profile.$id, athlete.$id);
  if (!link && athlete.parent_profile_id !== profile.$id) {
    return res.json({ error: 'You are not linked to this athlete.' }, 403);
  }

  const result = buildChildFields(payload);
  if (result.error) return res.json({ error: result.error }, 400);
  if (Object.keys(result.fields).length === 0) {
    return res.json({ error: 'No valid fields to update.' }, 400);
  }

  const updated = await db.updateDocument(DB_ID, 'athlete_profiles', athlete.$id, result.fields);
  return res.json({ athlete: updated });
}

async function linkAthlete(db, accountId, profile, payload, res) {
  if (!(await isGuardianCaller(db, profile))) {
    return res.json({ error: 'Parent or guardian role required.' }, 403);
  }

  const athleteProfileId = String(payload.athlete_profile_id || '').trim();
  const relationship = cleanText(payload.relationship, 100);
  if (!athleteProfileId || athleteProfileId.length > 64) {
    return res.json({ error: 'athlete_profile_id is required.' }, 400);
  }
  if (!relationship) return res.json({ error: 'relationship is required.' }, 400);

  const athlete = await db.getDocument(DB_ID, 'athlete_profiles', athleteProfileId).catch(() => null);
  if (!athlete) return res.json({ error: 'Athlete not found.' }, 404);

  const existing = await guardianLinkFor(db, profile.$id, athlete.$id);
  if (existing) return res.json({ link: existing, athlete });

  // Read grant for the athlete owner account (if the athlete has one).
  const ownerProfile = athlete.profile_id
    ? await db.getDocument(DB_ID, 'profiles', athlete.profile_id).catch(() => null)
    : null;
  const linkPermissions = [...new Set([
    Permission.read(Role.user(accountId)),
    ...(ownerProfile?.account_id ? [Permission.read(Role.user(ownerProfile.account_id))] : []),
  ])];

  const link = await db.createDocument(DB_ID, 'guardian_athletes', ID.unique(), {
    guardian_profile_id: profile.$id,
    athlete_id: athlete.$id,
    relationship,
    authority_attested_at: new Date().toISOString(),
    can_book: true,
    can_pay: true,
    can_message: true,
  }, linkPermissions);

  // Guardian also gets read access on the athlete document itself.
  const athletePermissions = [...new Set([...(athlete.$permissions || []), Permission.read(Role.user(accountId))])];
  await db.updateDocument(DB_ID, 'athlete_profiles', athlete.$id, {}, athletePermissions).catch(() => {});

  await audit(db, profile, 'family.link_athlete', 'GuardianAthlete', link.$id, {
    athlete_id: athlete.$id,
    relationship,
  });

  return res.json({ link, athlete });
}

async function setPermissions(db, profile, payload, res) {
  const athleteId = String(payload.athlete_id || '').trim();
  if (!athleteId) return res.json({ error: 'athlete_id is required.' }, 400);

  const link = await guardianLinkFor(db, profile.$id, athleteId);
  if (!link) return res.json({ error: 'You are not linked to this athlete.' }, 403);

  const updates = {};
  for (const field of ['can_book', 'can_pay', 'can_message']) {
    if (payload[field] === undefined) continue;
    if (typeof payload[field] !== 'boolean') return res.json({ error: `${field} must be a boolean.` }, 400);
    updates[field] = payload[field];
  }
  if (Object.keys(updates).length === 0) {
    return res.json({ error: 'No valid fields to update.' }, 400);
  }

  const updated = await db.updateDocument(DB_ID, 'guardian_athletes', link.$id, updates);
  await audit(db, profile, 'family.set_permissions', 'GuardianAthlete', link.$id, updates);
  return res.json({ link: updated });
}

async function listFamily(db, profile, res) {
  const childrenRows = await db.listDocuments(DB_ID, 'athlete_profiles', [
    Query.equal('parent_profile_id', profile.$id),
    Query.limit(100),
  ]).catch(() => ({ documents: [] }));
  const links = await callerGuardianLinks(db, profile.$id);

  // Include linked athletes that are not direct children.
  const childIds = new Set(childrenRows.documents.map((child) => child.$id));
  const linkedAthletes = [];
  for (const link of links) {
    if (childIds.has(link.athlete_id)) continue;
    const athlete = await db.getDocument(DB_ID, 'athlete_profiles', link.athlete_id).catch(() => null);
    if (athlete) linkedAthletes.push(athlete);
  }

  return res.json({
    children: childrenRows.documents,
    links,
    linked_athletes: linkedAthletes,
  });
}

export default async ({ req, res, error }) => {
  try {
    const accountId = callerAccountId(req);
    if (!accountId) return res.json({ error: 'Authentication required.' }, 401);

    const payload = body(req);
    const action = String(payload.action || '');
    const { db, users } = services();

    const profile = await profileForAccount(db, accountId);
    if (!profile) return res.json({ error: 'No profile found. Complete your account setup first.' }, 404);
    if (await activeBan(db, profile.email)) {
      return res.json({ error: 'This account is suspended.' }, 403);
    }

    switch (action) {
      case 'addChild':
        return await addChild(db, users, accountId, profile, payload, res);
      case 'updateChild':
        return await updateChild(db, profile, payload, res);
      case 'linkAthlete':
        return await linkAthlete(db, accountId, profile, payload, res);
      case 'setPermissions':
        return await setPermissions(db, profile, payload, res);
      case 'listFamily':
        return await listFamily(db, profile, res);
      default:
        return res.json({ error: 'Unknown action.' }, 400);
    }
  } catch (err) {
    error?.(err?.message || String(err));
    return res.json({ error: 'Could not process family request.' }, 500);
  }
};
