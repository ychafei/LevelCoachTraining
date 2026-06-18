import { Client, Databases, ID, Permission, Query, Role, Users } from 'node-appwrite';

const DB_ID = process.env.APPWRITE_DATABASE_ID || 'lctraining';

const GOAL_STATUSES = ['active', 'achieved', 'paused', 'archived'];
const PLAN_STATUSES = ['draft', 'active', 'completed', 'archived'];
const PLAN_ITEM_STATUSES = ['planned', 'in_progress', 'completed', 'skipped'];
const HOMEWORK_STATUSES = ['assigned', 'submitted', 'reviewed', 'archived'];
const KNOWN_SPORT_KEYS = new Set([
  'soccer',
  'basketball',
  'football',
  'baseball',
  'softball',
  'volleyball',
  'tennis',
  'lacrosse',
  'hockey',
  'golf',
  'track_field',
  'swimming',
  'speed_agility',
  'strength_conditioning',
  'general_performance',
]);
const SPORT_KEY_ALIASES = new Map([
  ['football_american', 'football'],
  ['american_football', 'football'],
  ['ice_hockey', 'hockey'],
  ['track', 'track_field'],
  ['track_and_field', 'track_field'],
  ['speed', 'speed_agility'],
  ['agility', 'speed_agility'],
  ['speed_and_agility', 'speed_agility'],
  ['speed_agility_training', 'speed_agility'],
  ['strength', 'strength_conditioning'],
  ['conditioning', 'strength_conditioning'],
  ['strength_and_conditioning', 'strength_conditioning'],
  ['general_athletic_performance', 'general_performance'],
]);

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

function normalizeSportLookup(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function canonicalSportKey(value) {
  const normalized = normalizeSportLookup(value);
  if (!normalized) return '';
  if (KNOWN_SPORT_KEYS.has(normalized)) return normalized;
  return SPORT_KEY_ALIASES.get(normalized) || '';
}

function validIsoDate(value) {
  const ms = Date.parse(String(value || ''));
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function intInRange(value, min, max) {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

async function validSportKey(db, sportKey) {
  if (!sportKey) return '';
  const canonical = canonicalSportKey(sportKey);
  if (!canonical) return null;
  const rows = await db.listDocuments(DB_ID, 'sports', [
    Query.equal('sport_key', canonical),
    Query.limit(1),
  ]).catch(() => ({ documents: [] }));
  const sport = rows.documents[0];
  if (sport?.active === false) return null;
  return sport?.sport_key || canonical;
}

// --- Athlete + coach resolution ------------------------------------------------

async function guardianAccountsForAthlete(db, athleteId) {
  const links = await db.listDocuments(DB_ID, 'guardian_athletes', [
    Query.equal('athlete_id', athleteId),
    Query.limit(25),
  ]).catch(() => ({ documents: [] }));
  const accounts = [];
  for (const link of links.documents) {
    const guardian = await db.getDocument(DB_ID, 'profiles', link.guardian_profile_id).catch(() => null);
    if (guardian?.account_id) accounts.push(guardian.account_id);
  }
  return [...new Set(accounts)];
}

// athlete_id may reference an athlete_profiles row (managed child / linked
// athlete) or, for self-managed adults, the athlete's own profiles row.
async function resolveAthlete(db, athleteId) {
  if (!athleteId) return null;
  const athleteDoc = await db.getDocument(DB_ID, 'athlete_profiles', athleteId).catch(() => null);
  if (athleteDoc) {
    const owner = athleteDoc.profile_id
      ? await db.getDocument(DB_ID, 'profiles', athleteDoc.profile_id).catch(() => null)
      : null;
    return {
      id: athleteDoc.$id,
      ownerProfileId: athleteDoc.profile_id || '',
      email: owner?.email || '',
      accountId: owner?.account_id || '',
      guardianAccounts: await guardianAccountsForAthlete(db, athleteDoc.$id),
    };
  }
  const profileDoc = await db.getDocument(DB_ID, 'profiles', athleteId).catch(() => null);
  if (profileDoc) {
    return {
      id: profileDoc.$id,
      ownerProfileId: profileDoc.$id,
      email: profileDoc.email || '',
      accountId: profileDoc.account_id || '',
      guardianAccounts: [],
    };
  }
  return null;
}

// Coach authority: coach label + owning coaches row. The label stacks with
// admin/superadmin and is the revocable capability bit — admins without it do
// not get coach authority here (revoking the label must revoke access).
async function coachContext(db, users, accountId) {
  const account = await users.get(accountId).catch(() => null);
  if (!(account?.labels || []).includes('coach')) return null;
  const rows = await db.listDocuments(DB_ID, 'coaches', [
    Query.equal('user_id', accountId),
    Query.limit(1),
  ]).catch(() => ({ documents: [] }));
  return rows.documents[0] || null;
}

// Coach must have a real relationship with the athlete: an existing session
// (by athlete_id or client_email) or an existing conversation.
async function hasRelationship(db, coach, athlete) {
  const byAthlete = await db.listDocuments(DB_ID, 'sessions', [
    Query.equal('coach_id', coach.$id),
    Query.equal('athlete_id', athlete.id),
    Query.limit(1),
  ]).catch(() => ({ documents: [] }));
  if (byAthlete.documents.length > 0) return true;

  if (athlete.email) {
    const byEmail = await db.listDocuments(DB_ID, 'sessions', [
      Query.equal('coach_id', coach.$id),
      Query.equal('client_email', athlete.email),
      Query.limit(1),
    ]).catch(() => ({ documents: [] }));
    if (byEmail.documents.length > 0) return true;

    const conversations = await db.listDocuments(DB_ID, 'conversations', [
      Query.equal('coach_id', coach.$id),
      Query.contains('participant_emails', athlete.email),
      Query.limit(1),
    ]).catch(() => ({ documents: [] }));
    if (conversations.documents.length > 0) return true;
  }
  return false;
}

// Per-document grants: read coach + athlete + guardians; update coach.
// Homework and check-ins also grant the athlete account update.
function grantsFor(coach, athlete, { athleteUpdate = false } = {}) {
  const perms = new Set();
  if (coach?.user_id) {
    perms.add(Permission.read(Role.user(coach.user_id)));
    perms.add(Permission.update(Role.user(coach.user_id)));
  }
  if (athlete?.accountId) {
    perms.add(Permission.read(Role.user(athlete.accountId)));
    if (athleteUpdate) perms.add(Permission.update(Role.user(athlete.accountId)));
  }
  for (const guardianAccount of athlete?.guardianAccounts || []) {
    perms.add(Permission.read(Role.user(guardianAccount)));
  }
  return [...perms];
}

// Loads coach + athlete and verifies relationship for coach-authored writes.
async function coachAthleteContext(db, users, accountId, athleteId) {
  const coach = await coachContext(db, users, accountId);
  if (!coach) return { error: 'Coach authority required.', status: 403 };
  const athlete = await resolveAthlete(db, athleteId);
  if (!athlete) return { error: 'Athlete not found.', status: 404 };
  if (!(await hasRelationship(db, coach, athlete))) {
    return { error: 'No coaching relationship with this athlete.', status: 403 };
  }
  return { coach, athlete };
}

// Verifies the caller owns an existing coach-authored document.
async function ownedDocument(db, users, accountId, collection, documentId) {
  const coach = await coachContext(db, users, accountId);
  if (!coach) return { error: 'Coach authority required.', status: 403 };
  const doc = await db.getDocument(DB_ID, collection, documentId).catch(() => null);
  if (!doc) return { error: 'Not found.', status: 404 };
  if (doc.coach_id !== coach.$id) return { error: 'You do not own this record.', status: 403 };
  return { coach, doc };
}

function callerIsAthlete(athlete, profile) {
  return Boolean(athlete && (athlete.ownerProfileId === profile.$id || athlete.id === profile.$id));
}

function todayInTz(timezone = 'America/Detroit') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function sessionBelongsToAthlete(session, athlete, profile) {
  const sessionAthleteId = String(session?.athlete_id || '').trim();
  if (sessionAthleteId && sessionAthleteId === athlete.id) return true;
  if (session?.booked_by_profile_id && session.booked_by_profile_id === profile.$id) return true;
  return Boolean(athlete.email
    && String(session?.client_email || '').toLowerCase() === String(athlete.email).toLowerCase());
}

// --- Field builders --------------------------------------------------------------

async function buildCommonFields(db, payload, { requireTitle = true } = {}) {
  const title = cleanText(payload.title, 200);
  if (requireTitle && !title) return { error: 'title is required (max 200 characters).' };
  const description = cleanText(payload.description, 20000);
  let sportKey = '';
  if (payload.sport_key !== undefined && payload.sport_key !== '') {
    sportKey = await validSportKey(db, cleanText(payload.sport_key, 100));
    if (sportKey === null) return { error: 'sport_key is not a known sport.' };
  }
  return { title, description, sportKey };
}

// --- Action handlers --------------------------------------------------------------

async function goalCreate(db, users, accountId, profile, payload, res) {
  const ctx = await coachAthleteContext(db, users, accountId, String(payload.athlete_id || '').trim());
  if (ctx.error) return res.json({ error: ctx.error }, ctx.status);
  const fields = await buildCommonFields(db, payload);
  if (fields.error) return res.json({ error: fields.error }, 400);
  const targetDate = payload.target_date ? validIsoDate(payload.target_date) : '';
  if (payload.target_date && !targetDate) return res.json({ error: 'target_date must be a valid date.' }, 400);

  const goal = await db.createDocument(DB_ID, 'athlete_goals', ID.unique(), {
    coach_id: ctx.coach.$id,
    athlete_id: ctx.athlete.id,
    sport_key: fields.sportKey,
    title: fields.title,
    description: fields.description,
    target_date: targetDate,
    status: 'active',
    created_by_profile_id: profile.$id,
  }, grantsFor(ctx.coach, ctx.athlete));
  return res.json({ goal });
}

async function goalUpdate(db, users, accountId, payload, res) {
  const ctx = await ownedDocument(db, users, accountId, 'athlete_goals', String(payload.goal_id || '').trim());
  if (ctx.error) return res.json({ error: ctx.error }, ctx.status);

  const updates = {};
  if (payload.title !== undefined) {
    const title = cleanText(payload.title, 200);
    if (!title) return res.json({ error: 'title cannot be empty.' }, 400);
    updates.title = title;
  }
  if (payload.description !== undefined) updates.description = cleanText(payload.description, 20000);
  if (payload.target_date !== undefined) {
    const targetDate = payload.target_date ? validIsoDate(payload.target_date) : '';
    if (payload.target_date && !targetDate) return res.json({ error: 'target_date must be a valid date.' }, 400);
    updates.target_date = targetDate;
  }
  if (payload.status !== undefined) {
    if (!GOAL_STATUSES.includes(payload.status)) return res.json({ error: 'status is invalid.' }, 400);
    updates.status = payload.status;
  }
  if (payload.sport_key !== undefined) {
    const sportKey = payload.sport_key ? await validSportKey(db, cleanText(payload.sport_key, 100)) : '';
    if (sportKey === null) return res.json({ error: 'sport_key is not a known sport.' }, 400);
    updates.sport_key = sportKey;
  }
  if (Object.keys(updates).length === 0) return res.json({ error: 'No valid fields to update.' }, 400);

  const goal = await db.updateDocument(DB_ID, 'athlete_goals', ctx.doc.$id, updates);
  return res.json({ goal });
}

async function planCreate(db, users, accountId, profile, payload, res) {
  const ctx = await coachAthleteContext(db, users, accountId, String(payload.athlete_id || '').trim());
  if (ctx.error) return res.json({ error: ctx.error }, ctx.status);
  const fields = await buildCommonFields(db, payload);
  if (fields.error) return res.json({ error: fields.error }, 400);
  const startsOn = payload.starts_on ? validIsoDate(payload.starts_on) : '';
  const endsOn = payload.ends_on ? validIsoDate(payload.ends_on) : '';
  if ((payload.starts_on && !startsOn) || (payload.ends_on && !endsOn)) {
    return res.json({ error: 'starts_on/ends_on must be valid dates.' }, 400);
  }

  const plan = await db.createDocument(DB_ID, 'training_plans', ID.unique(), {
    coach_id: ctx.coach.$id,
    athlete_id: ctx.athlete.id,
    sport_key: fields.sportKey,
    title: fields.title,
    description: fields.description,
    starts_on: startsOn,
    ends_on: endsOn,
    status: 'active',
    created_by_profile_id: profile.$id,
  }, grantsFor(ctx.coach, ctx.athlete));
  return res.json({ plan });
}

async function planUpdate(db, users, accountId, payload, res) {
  const ctx = await ownedDocument(db, users, accountId, 'training_plans', String(payload.plan_id || '').trim());
  if (ctx.error) return res.json({ error: ctx.error }, ctx.status);

  const updates = {};
  if (payload.title !== undefined) {
    const title = cleanText(payload.title, 200);
    if (!title) return res.json({ error: 'title cannot be empty.' }, 400);
    updates.title = title;
  }
  if (payload.description !== undefined) updates.description = cleanText(payload.description, 20000);
  for (const field of ['starts_on', 'ends_on']) {
    if (payload[field] === undefined) continue;
    const value = payload[field] ? validIsoDate(payload[field]) : '';
    if (payload[field] && !value) return res.json({ error: `${field} must be a valid date.` }, 400);
    updates[field] = value;
  }
  if (payload.status !== undefined) {
    if (!PLAN_STATUSES.includes(payload.status)) return res.json({ error: 'status is invalid.' }, 400);
    updates.status = payload.status;
  }
  if (payload.sport_key !== undefined) {
    const sportKey = payload.sport_key ? await validSportKey(db, cleanText(payload.sport_key, 100)) : '';
    if (sportKey === null) return res.json({ error: 'sport_key is not a known sport.' }, 400);
    updates.sport_key = sportKey;
  }
  if (Object.keys(updates).length === 0) return res.json({ error: 'No valid fields to update.' }, 400);

  const plan = await db.updateDocument(DB_ID, 'training_plans', ctx.doc.$id, updates);
  return res.json({ plan });
}

async function planItemCreate(db, users, accountId, payload, res) {
  const ctx = await ownedDocument(db, users, accountId, 'training_plans', String(payload.plan_id || '').trim());
  if (ctx.error) return res.json({ error: ctx.error }, ctx.status);

  const title = cleanText(payload.title, 200);
  if (!title) return res.json({ error: 'title is required (max 200 characters).' }, 400);
  const week = payload.week === undefined ? 0 : intInRange(payload.week, 0, 104);
  const position = payload.position === undefined ? 0 : intInRange(payload.position, 0, 999);
  if (week === null) return res.json({ error: 'week must be an integer between 0 and 104.' }, 400);
  if (position === null) return res.json({ error: 'position must be an integer between 0 and 999.' }, 400);

  const athlete = await resolveAthlete(db, ctx.doc.athlete_id);
  const item = await db.createDocument(DB_ID, 'training_plan_items', ID.unique(), {
    plan_id: ctx.doc.$id,
    coach_id: ctx.coach.$id,
    athlete_id: ctx.doc.athlete_id,
    title,
    description: cleanText(payload.description, 20000),
    week,
    position,
    status: 'planned',
  }, grantsFor(ctx.coach, athlete));
  return res.json({ item });
}

async function planItemUpdate(db, users, accountId, payload, res) {
  const ctx = await ownedDocument(db, users, accountId, 'training_plan_items', String(payload.item_id || '').trim());
  if (ctx.error) return res.json({ error: ctx.error }, ctx.status);

  const updates = {};
  if (payload.title !== undefined) {
    const title = cleanText(payload.title, 200);
    if (!title) return res.json({ error: 'title cannot be empty.' }, 400);
    updates.title = title;
  }
  if (payload.description !== undefined) updates.description = cleanText(payload.description, 20000);
  if (payload.week !== undefined) {
    const week = intInRange(payload.week, 0, 104);
    if (week === null) return res.json({ error: 'week must be an integer between 0 and 104.' }, 400);
    updates.week = week;
  }
  if (payload.position !== undefined) {
    const position = intInRange(payload.position, 0, 999);
    if (position === null) return res.json({ error: 'position must be an integer between 0 and 999.' }, 400);
    updates.position = position;
  }
  if (payload.status !== undefined) {
    if (!PLAN_ITEM_STATUSES.includes(payload.status)) return res.json({ error: 'status is invalid.' }, 400);
    updates.status = payload.status;
  }
  if (Object.keys(updates).length === 0) return res.json({ error: 'No valid fields to update.' }, 400);

  const item = await db.updateDocument(DB_ID, 'training_plan_items', ctx.doc.$id, updates);
  return res.json({ item });
}

async function homeworkCreate(db, users, accountId, profile, payload, res) {
  const ctx = await coachAthleteContext(db, users, accountId, String(payload.athlete_id || '').trim());
  if (ctx.error) return res.json({ error: ctx.error }, ctx.status);
  const fields = await buildCommonFields(db, payload);
  if (fields.error) return res.json({ error: fields.error }, 400);
  const dueDate = payload.due_date ? validIsoDate(payload.due_date) : '';
  if (payload.due_date && !dueDate) return res.json({ error: 'due_date must be a valid date.' }, 400);

  const homework = await db.createDocument(DB_ID, 'homework_assignments', ID.unique(), {
    coach_id: ctx.coach.$id,
    athlete_id: ctx.athlete.id,
    sport_key: fields.sportKey,
    title: fields.title,
    instructions: cleanText(payload.instructions, 20000),
    due_date: dueDate,
    status: 'assigned',
    athlete_notes: '',
    created_by_profile_id: profile.$id,
  }, grantsFor(ctx.coach, ctx.athlete, { athleteUpdate: true }));
  return res.json({ homework });
}

async function homeworkUpdate(db, users, accountId, payload, res) {
  const ctx = await ownedDocument(db, users, accountId, 'homework_assignments', String(payload.homework_id || '').trim());
  if (ctx.error) return res.json({ error: ctx.error }, ctx.status);

  const updates = {};
  if (payload.title !== undefined) {
    const title = cleanText(payload.title, 200);
    if (!title) return res.json({ error: 'title cannot be empty.' }, 400);
    updates.title = title;
  }
  if (payload.instructions !== undefined) updates.instructions = cleanText(payload.instructions, 20000);
  if (payload.due_date !== undefined) {
    const dueDate = payload.due_date ? validIsoDate(payload.due_date) : '';
    if (payload.due_date && !dueDate) return res.json({ error: 'due_date must be a valid date.' }, 400);
    updates.due_date = dueDate;
  }
  if (payload.status !== undefined) {
    if (!HOMEWORK_STATUSES.includes(payload.status)) return res.json({ error: 'status is invalid.' }, 400);
    updates.status = payload.status;
  }
  if (Object.keys(updates).length === 0) return res.json({ error: 'No valid fields to update.' }, 400);

  const homework = await db.updateDocument(DB_ID, 'homework_assignments', ctx.doc.$id, updates);
  return res.json({ homework });
}

// Athletes submit their own homework: assigned -> submitted (+ athlete_notes).
async function homeworkSubmit(db, profile, payload, res) {
  const homeworkId = String(payload.homework_id || '').trim();
  if (!homeworkId) return res.json({ error: 'homework_id is required.' }, 400);

  const homework = await db.getDocument(DB_ID, 'homework_assignments', homeworkId).catch(() => null);
  if (!homework) return res.json({ error: 'Homework not found.' }, 404);

  const athlete = await resolveAthlete(db, homework.athlete_id);
  if (!callerIsAthlete(athlete, profile)) {
    return res.json({ error: 'Only the assigned athlete can submit this homework.' }, 403);
  }
  if (homework.status !== 'assigned') {
    return res.json({ error: 'This homework has already been submitted.' }, 400);
  }

  const updated = await db.updateDocument(DB_ID, 'homework_assignments', homework.$id, {
    status: 'submitted',
    athlete_notes: cleanText(payload.athlete_notes, 20000),
    submitted_at: new Date().toISOString(),
  });
  return res.json({ homework: updated });
}

async function assessmentCreate(db, users, accountId, profile, payload, res) {
  const ctx = await coachAthleteContext(db, users, accountId, String(payload.athlete_id || '').trim());
  if (ctx.error) return res.json({ error: ctx.error }, ctx.status);

  let scores = payload.scores;
  if (typeof scores === 'string') {
    try { scores = JSON.parse(scores); } catch { return res.json({ error: 'scores must be valid JSON.' }, 400); }
  }
  if (!scores || typeof scores !== 'object') return res.json({ error: 'scores must be a JSON object.' }, 400);
  const serialized = JSON.stringify(scores);
  if (serialized.length > 20000) return res.json({ error: 'scores is too large.' }, 400);

  let sportKey = '';
  if (payload.sport_key) {
    sportKey = await validSportKey(db, cleanText(payload.sport_key, 100));
    if (sportKey === null) return res.json({ error: 'sport_key is not a known sport.' }, 400);
  }

  const assessment = await db.createDocument(DB_ID, 'athlete_assessments', ID.unique(), {
    coach_id: ctx.coach.$id,
    athlete_id: ctx.athlete.id,
    sport_key: sportKey,
    scores: serialized,
    notes: cleanText(payload.notes, 20000),
    assessed_at: new Date().toISOString(), // server-set
    created_by_profile_id: profile.$id,
  }, grantsFor(ctx.coach, ctx.athlete));
  return res.json({ assessment });
}

async function checkinCreate(db, users, accountId, profile, payload, res) {
  const ratings = {};
  for (const field of ['mood', 'energy', 'soreness']) {
    if (payload[field] === undefined) continue;
    const value = intInRange(payload[field], 1, 10);
    if (value === null) return res.json({ error: `${field} must be an integer between 1 and 10.` }, 400);
    ratings[field] = value;
  }
  const notes = cleanText(payload.notes, 20000);
  const sessionId = String(payload.session_id || '').trim();
  if (!sessionId) return res.json({ error: 'session_id is required for session-day wellness reports.' }, 400);

  const requestedAthleteId = String(payload.athlete_id || '').trim();
  let athlete = null;
  if (requestedAthleteId) {
    const candidate = await resolveAthlete(db, requestedAthleteId);
    if (!candidate || !callerIsAthlete(candidate, profile)) {
      return res.json({ error: 'You can only create wellness reports for yourself.' }, 403);
    }
    athlete = candidate;
  } else {
    const own = await db.listDocuments(DB_ID, 'athlete_profiles', [
      Query.equal('profile_id', profile.$id),
      Query.limit(1),
    ]).catch(() => ({ documents: [] }));
    athlete = own.documents[0]
      ? await resolveAthlete(db, own.documents[0].$id)
      : await resolveAthlete(db, profile.$id);
  }
  if (!athlete) return res.json({ error: 'Athlete not found.' }, 404);

  const session = await db.getDocument(DB_ID, 'sessions', sessionId).catch(() => null);
  if (!session) return res.json({ error: 'Session not found.' }, 400);
  if (!sessionBelongsToAthlete(session, athlete, profile)) {
    return res.json({ error: 'This session does not belong to this athlete.' }, 403);
  }
  if (!['pending', 'confirmed'].includes(session.status)) {
    return res.json({ error: 'Wellness reports can only be submitted before a scheduled session is completed.' }, 409);
  }
  if (session.date !== todayInTz(session.timezone || 'America/Detroit')) {
    return res.json({ error: 'Wellness reports open only on the day of the session.' }, 409);
  }
  const existing = await db.listDocuments(DB_ID, 'session_check_ins', [
    Query.equal('session_id', session.$id),
    Query.equal('athlete_id', athlete.id),
    Query.limit(1),
  ]).catch(() => ({ documents: [] }));
  if (existing.documents.length > 0) {
    return res.json({ error: 'A wellness report has already been submitted for this session.' }, 409);
  }
  const coachForGrants = session.coach_id
    ? await db.getDocument(DB_ID, 'coaches', session.coach_id).catch(() => null)
    : null;
  if (!coachForGrants) return res.json({ error: 'Session coach not found.' }, 400);

  const checkIn = await db.createDocument(DB_ID, 'session_check_ins', ID.unique(), {
    coach_id: coachForGrants.$id,
    athlete_id: athlete.id,
    session_id: sessionId,
    mood: ratings.mood ?? null,
    energy: ratings.energy ?? null,
    soreness: ratings.soreness ?? null,
    notes,
    injury_flag: payload.injury_flag === true,
    created_by_profile_id: profile.$id,
    created_by_role: 'athlete',
  }, grantsFor(coachForGrants, {
    ...athlete,
    accountId: athlete.accountId || accountId,
  }, { athleteUpdate: true }));
  return res.json({ check_in: checkIn });
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
      case 'goal.create':
        return await goalCreate(db, users, accountId, profile, payload, res);
      case 'goal.update':
        return await goalUpdate(db, users, accountId, payload, res);
      case 'plan.create':
        return await planCreate(db, users, accountId, profile, payload, res);
      case 'plan.update':
        return await planUpdate(db, users, accountId, payload, res);
      case 'planItem.create':
        return await planItemCreate(db, users, accountId, payload, res);
      case 'planItem.update':
        return await planItemUpdate(db, users, accountId, payload, res);
      case 'homework.create':
        return await homeworkCreate(db, users, accountId, profile, payload, res);
      case 'homework.update':
        return await homeworkUpdate(db, users, accountId, payload, res);
      case 'homework.submit':
        return await homeworkSubmit(db, profile, payload, res);
      case 'assessment.create':
        return await assessmentCreate(db, users, accountId, profile, payload, res);
      case 'checkin.create':
        return await checkinCreate(db, users, accountId, profile, payload, res);
      default:
        return res.json({ error: 'Unknown action.' }, 400);
    }
  } catch (err) {
    error?.(err?.message || String(err));
    return res.json({ error: 'Could not process training request.' }, 500);
  }
};
