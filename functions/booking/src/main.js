import { Client, Databases, ID, Permission, Query, Role, Users } from 'node-appwrite';

const DB_ID = process.env.APPWRITE_DATABASE_ID || 'lctraining';
const DEFAULT_TIMEZONE = 'America/Detroit';
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const SIGNER_TO_TEMPLATE_ROLE = {
  athlete: 'athlete',
  guardian: 'guardian',
};

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

function isAdminLabel(labels) {
  return (labels || []).some((label) => ['admin', 'superadmin', 'super_admin'].includes(label));
}

// --- Basic validation helpers ------------------------------------------------

function cleanText(value, max) {
  const text = String(value ?? '').replace(/<[^>]*>/g, '').trim();
  return text.slice(0, max);
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const [y, m, d] = String(value).split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function validTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ''));
}

function timeToMinutes(value) {
  const [h, m] = String(value).split(':').map(Number);
  return h * 60 + m;
}

function weekdayName(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return DAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

function parseJson(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    const value = JSON.parse(String(raw));
    return value && typeof value === 'object' ? value : {};
  } catch { return {}; }
}

// --- Timezone math (no external deps) ----------------------------------------

function tzOffsetMs(timeZone, utcMs) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = {};
  for (const part of dtf.formatToParts(new Date(utcMs))) {
    if (part.type !== 'literal') parts[part.type] = part.value;
  }
  const asUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) % 24, Number(parts.minute), Number(parts.second)
  );
  return asUtc - utcMs;
}

// Convert a wall-clock date+time in an IANA timezone to a UTC timestamp (ms).
function zonedStartUtcMs(dateStr, timeStr, timeZone) {
  const naive = Date.parse(`${dateStr}T${timeStr}:00Z`);
  let offset = tzOffsetMs(timeZone, naive);
  offset = tzOffsetMs(timeZone, naive - offset); // refine across DST boundaries
  return naive - offset;
}

function coachTimezone(coach) {
  const tz = String(coach.timezone || '').trim();
  if (!tz) return DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch { return DEFAULT_TIMEZONE; }
}

// --- Coach state, availability windows, conflicts -----------------------------

function coachAccepting(coach) {
  // `published` is the cutover gate; fall back to is_active while it rolls out.
  if (coach.published !== undefined && coach.published !== null) return coach.published === true;
  return coach.is_active !== false;
}

function bookingRulesFor(coach) {
  const rules = parseJson(coach.booking_rules);
  const clamp = (value, min, max, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };
  return {
    minNoticeHours: clamp(rules.min_notice_hours, 0, 720, 0),
    bufferMinutes: clamp(rules.buffer_minutes, 0, 240, 0),
    maxAdvanceDays: clamp(rules.max_advance_days, 1, 730, 365),
  };
}

function dayMatches(rowDay, weekday) {
  const a = String(rowDay || '').trim().toLowerCase();
  if (!a) return false;
  const b = weekday.toLowerCase();
  return a === b || a === b.slice(0, 3);
}

function overlaps(startA, endA, startB, endB) {
  return startA < endB && endA > startB;
}

async function validateSlot(db, coach, { date, startTime, durationMinutes, excludeSessionId }) {
  const timezone = coachTimezone(coach);
  const rules = bookingRulesFor(coach);
  const weekday = weekdayName(date);
  const startMin = timeToMinutes(startTime);
  const endMin = startMin + durationMinutes;
  const bufStart = startMin - rules.bufferMinutes;
  const bufEnd = endMin + rules.bufferMinutes;

  // Past / notice / advance checks evaluated in the coach timezone.
  const startUtcMs = zonedStartUtcMs(date, startTime, timezone);
  const now = Date.now();
  if (startUtcMs <= now) return { error: 'That time is in the past.', status: 400 };
  if (startUtcMs - now < rules.minNoticeHours * 3600000) {
    return { error: `This coach requires at least ${rules.minNoticeHours} hours notice.`, status: 400 };
  }
  if (startUtcMs - now > rules.maxAdvanceDays * 86400000) {
    return { error: `This coach only accepts bookings up to ${rules.maxAdvanceDays} days in advance.`, status: 400 };
  }

  // Availability windows: legacy weekly JSON + availability_blocks rows.
  const windows = [];
  const blackouts = [];
  const legacy = parseJson(coach.availability)[weekday];
  if (legacy?.enabled && validTime(legacy.start) && validTime(legacy.end)) {
    windows.push([timeToMinutes(legacy.start), timeToMinutes(legacy.end)]);
  }

  const blockRows = await db.listDocuments(DB_ID, 'availability_blocks', [
    Query.equal('coach_id', coach.$id),
    Query.limit(500),
  ]).catch(() => ({ documents: [] }));
  for (const row of blockRows.documents) {
    if (row.active === false) continue;
    const matchesDate = row.date === date || (!row.date && dayMatches(row.day, weekday));
    if (row.block_type === 'blackout') {
      if (row.date === date || dayMatches(row.day, weekday)) {
        if (validTime(row.start_time) && validTime(row.end_time)) {
          blackouts.push([timeToMinutes(row.start_time), timeToMinutes(row.end_time)]);
        } else {
          blackouts.push([0, 24 * 60]); // all-day blackout
        }
      }
      continue;
    }
    const applies = row.block_type === 'date' ? row.date === date : matchesDate;
    if (applies && validTime(row.start_time) && validTime(row.end_time)) {
      windows.push([timeToMinutes(row.start_time), timeToMinutes(row.end_time)]);
    }
  }

  if (windows.length === 0) return { error: 'The coach has no availability on that day.', status: 409 };
  const fits = windows.some(([winStart, winEnd]) => startMin >= winStart && endMin <= winEnd);
  if (!fits) return { error: 'That time is outside the coach availability window.', status: 409 };
  if (blackouts.some(([blkStart, blkEnd]) => overlaps(bufStart, bufEnd, blkStart, blkEnd))) {
    return { error: 'The coach is unavailable at that time.', status: 409 };
  }

  // Conflicts with pending/confirmed sessions on the same date (buffered both sides).
  const sessionRows = await db.listDocuments(DB_ID, 'sessions', [
    Query.equal('coach_id', coach.$id),
    Query.equal('date', date),
    Query.equal('status', ['pending', 'confirmed']),
    Query.limit(500),
  ]).catch(() => ({ documents: [] }));
  for (const session of sessionRows.documents) {
    if (excludeSessionId && session.$id === excludeSessionId) continue;
    if (!validTime(session.start_time)) continue;
    const sessionStart = timeToMinutes(session.start_time);
    const sessionEnd = sessionStart + (Number(session.duration_minutes) || 60);
    if (overlaps(bufStart, bufEnd, sessionStart, sessionEnd)) {
      return { error: 'That time conflicts with an existing session.', status: 409 };
    }
  }

  // Conflicts with coach_blocks (all-day and partial-day).
  const coachBlockRows = await db.listDocuments(DB_ID, 'coach_blocks', [
    Query.equal('coach_id', coach.$id),
    Query.equal('is_active', true),
    Query.limit(500),
  ]).catch(() => ({ documents: [] }));
  for (const block of coachBlockRows.documents) {
    if (!block.start_date || !block.end_date) continue;
    if (date < block.start_date || date > block.end_date) continue;
    if (block.block_all_day !== false && !(validTime(block.blocked_start_time) && validTime(block.blocked_end_time))) {
      return { error: 'The coach is unavailable on that date.', status: 409 };
    }
    if (validTime(block.blocked_start_time) && validTime(block.blocked_end_time)
      && overlaps(bufStart, bufEnd, timeToMinutes(block.blocked_start_time), timeToMinutes(block.blocked_end_time))) {
      return { error: 'The coach is unavailable at that time.', status: 409 };
    }
  }

  return { timezone, startUtcIso: new Date(startUtcMs).toISOString(), startUtcMs };
}

// --- Legal packet gate (mirrors createStripeCheckout) -------------------------

function activeRequired(template, now = Date.now()) {
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

async function legalPacketCompleteFor(db, profile, signerRole, athleteId) {
  const templateRole = SIGNER_TO_TEMPLATE_ROLE[signerRole];
  if (!templateRole) return false;

  const [templateRows, agreementRows] = await Promise.all([
    db.listDocuments(DB_ID, 'legal_templates', [
      Query.equal('role', templateRole),
      Query.equal('required', true),
      Query.limit(100),
    ]),
    db.listDocuments(DB_ID, 'legal_agreements', [
      Query.equal('signer_profile_id', profile.$id),
      Query.equal('signer_role', signerRole),
      Query.equal('status', 'signed'),
      Query.limit(200),
    ]),
  ]);

  const templates = templateRows.documents.filter(activeRequired);
  if (templates.length === 0) return false;
  return templates.every((template) =>
    agreementRows.documents.some((agreement) =>
      agreementMatchesTemplate(agreement, template)
      // Guardian signings should bind to the athlete; accept legacy unbound rows.
      && (signerRole !== 'guardian' || !athleteId || !agreement.athlete_id || agreement.athlete_id === athleteId)
    )
  );
}

// --- Guardians, notifications, emails -----------------------------------------

async function guardianLink(db, guardianProfileId, athleteId) {
  const rows = await db.listDocuments(DB_ID, 'guardian_athletes', [
    Query.equal('guardian_profile_id', guardianProfileId),
    Query.equal('athlete_id', athleteId),
    Query.limit(1),
  ]).catch(() => ({ documents: [] }));
  return rows.documents[0] || null;
}

async function guardianAccountsForAthlete(db, athleteId) {
  if (!athleteId) return [];
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

function fullName(profile) {
  return [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim() || profile.email || 'Client';
}

async function notify(db, { accountId, profileId, type, title, message, data }) {
  if (!accountId) return;
  await createDocumentResilient(db, 'notifications', {
    recipient_account_id: accountId,
    recipient_profile_id: profileId || '',
    type,
    title: cleanText(title, 200),
    body: cleanText(message, 2000),
    data: JSON.stringify(data || {}),
    read: false,
  }, [
    Permission.read(Role.user(accountId)),
    Permission.update(Role.user(accountId)),
  ]).catch(() => {});
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatStart(startUtcIso, timezone) {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, dateStyle: 'full', timeStyle: 'short',
    }).format(new Date(startUtcIso));
  } catch { return startUtcIso; }
}

// Transactional email via the Resend HTTP API. Fixed server-side templates only.
async function sendEmail({ to, subject, html }, error) {
  try {
    if (!process.env.RESEND_API_KEY || !to) return;
    const from = process.env.EMAIL_FROM || 'LevelCoach Training <notifications@levelcoachtraining.com>';
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
      throw new Error(data?.message || `Resend returned ${response.status}`);
    }
  } catch (err) {
    error?.(`Email send failed: ${err?.message || err}`);
  }
}

// --- Resilient writes (tolerate attributes still rolling out) -----------------

async function createDocumentResilient(db, collection, data, permissions) {
  let payload = { ...data };
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      return await db.createDocument(DB_ID, collection, ID.unique(), payload, permissions);
    } catch (err) {
      const match = /unknown attribute:?\s*"?([\w.-]+)"?/i.exec(err?.message || '');
      if (!match || !(match[1] in payload)) throw err;
      delete payload[match[1]];
    }
  }
  return db.createDocument(DB_ID, collection, ID.unique(), payload, permissions);
}

async function updateDocumentResilient(db, collection, id, data) {
  let payload = { ...data };
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (Object.keys(payload).length === 0) return db.getDocument(DB_ID, collection, id);
    try {
      return await db.updateDocument(DB_ID, collection, id, payload);
    } catch (err) {
      const match = /unknown attribute:?\s*"?([\w.-]+)"?/i.exec(err?.message || '');
      if (!match || !(match[1] in payload)) throw err;
      delete payload[match[1]];
    }
  }
  return db.updateDocument(DB_ID, collection, id, payload);
}

// --- Shared session helpers ----------------------------------------------------

function sessionStartMs(session, coach) {
  if (session.starts_at_utc) {
    const ms = Date.parse(session.starts_at_utc);
    if (Number.isFinite(ms)) return ms;
  }
  const timezone = session.timezone || coachTimezone(coach || {});
  if (validDate(session.date) && validTime(session.start_time)) {
    return zonedStartUtcMs(session.date, session.start_time, timezone);
  }
  return null;
}

async function sessionAuthority(db, users, accountId, profile, session) {
  const coach = await db.getDocument(DB_ID, 'coaches', session.coach_id).catch(() => null);
  const isClient = session.booked_by_profile_id === profile.$id
    || (session.client_email && profile.email
      && String(session.client_email).toLowerCase() === String(profile.email).toLowerCase());
  const isCoach = Boolean(coach?.user_id && coach.user_id === accountId);
  let isGuardian = false;
  if (!isClient && !isCoach && session.athlete_id) {
    isGuardian = Boolean(await guardianLink(db, profile.$id, session.athlete_id));
  }
  let isAdmin = false;
  if (!isClient && !isCoach && !isGuardian) {
    const account = await users.get(accountId).catch(() => null);
    isAdmin = isAdminLabel(account?.labels);
  }
  return { coach, isClient, isCoach, isGuardian, isAdmin, any: isClient || isCoach || isGuardian || isAdmin };
}

async function restoreCredit(db, creditId, error) {
  if (!creditId) return;
  try {
    const credit = await db.getDocument(DB_ID, 'session_credits', creditId);
    const used = Math.max(0, (Number(credit.used_credits) || 0) - 1);
    await db.updateDocument(DB_ID, 'session_credits', creditId, { used_credits: used });
  } catch (err) {
    error?.(`Credit restore failed: ${err?.message || err}`);
  }
}

async function notifyBothSides(db, { session, coach, profile, type, title, clientMessage, coachMessage }) {
  const data = { session_id: session.$id, coach_id: session.coach_id, date: session.date, start_time: session.start_time };
  const coachProfile = coach?.user_id ? await profileForAccount(db, coach.user_id).catch(() => null) : null;
  await notify(db, {
    accountId: coach?.user_id, profileId: coachProfile?.$id,
    type, title, message: coachMessage, data,
  });
  let clientProfile = session.booked_by_profile_id
    ? await db.getDocument(DB_ID, 'profiles', session.booked_by_profile_id).catch(() => null)
    : null;
  if (!clientProfile && session.client_email) {
    const rows = await db.listDocuments(DB_ID, 'profiles', [
      Query.equal('email', [session.client_email, String(session.client_email).toLowerCase()]),
      Query.limit(1),
    ]).catch(() => ({ documents: [] }));
    clientProfile = rows.documents[0] || null;
  }
  const clientAccount = clientProfile?.account_id
    || (profile && String(profile.email).toLowerCase() === String(session.client_email).toLowerCase() ? profile.account_id : '');
  await notify(db, {
    accountId: clientAccount, profileId: clientProfile?.$id || '',
    type, title, message: clientMessage, data,
  });
}

// --- Actions -------------------------------------------------------------------

async function bookAction(db, users, accountId, profile, payload, res, error) {
  const coachId = String(payload.coach_id || '').trim();
  const creditId = String(payload.credit_id || '').trim();
  const date = String(payload.date || '').trim();
  const startTime = String(payload.start_time || '').trim();
  const durationMinutes = Number(payload.duration_minutes);
  const athleteId = String(payload.athlete_id || '').trim();
  const notes = cleanText(payload.notes, 20000);

  if (!coachId || coachId.length > 64) return res.json({ error: 'coach_id is required.' }, 400);
  if (!creditId || creditId.length > 64) return res.json({ error: 'credit_id is required.' }, 400);
  if (!validDate(date)) return res.json({ error: 'date must be YYYY-MM-DD.' }, 400);
  if (!validTime(startTime)) return res.json({ error: 'start_time must be HH:MM.' }, 400);
  if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 480) {
    return res.json({ error: 'duration_minutes must be an integer between 15 and 480.' }, 400);
  }

  const coach = await db.getDocument(DB_ID, 'coaches', coachId).catch(() => null);
  if (!coach) return res.json({ error: 'Coach not found.' }, 404);
  if (!coachAccepting(coach)) return res.json({ error: 'This coach is not accepting bookings.' }, 400);

  // Minors never book directly — a linked guardian books for them.
  if (profile.is_minor === true) {
    return res.json({ error: 'A parent or guardian must book sessions for minors.' }, 403);
  }

  // Athlete resolution: self athlete profile, or guardian booking for a child.
  let athlete = null;
  let guardianBooking = false;
  if (athleteId) {
    athlete = await db.getDocument(DB_ID, 'athlete_profiles', athleteId).catch(() => null);
    if (!athlete) return res.json({ error: 'Athlete not found.' }, 404);
    if (athlete.profile_id === profile.$id) {
      guardianBooking = false;
    } else {
      const link = await guardianLink(db, profile.$id, athlete.$id);
      if (!link) return res.json({ error: 'You are not linked to this athlete.' }, 403);
      if (link.can_book === false) return res.json({ error: 'Your guardian permissions do not allow booking.' }, 403);
      guardianBooking = true;
    }
  }

  const signerRole = guardianBooking ? 'guardian' : 'athlete';
  if (!(await legalPacketCompleteFor(db, profile, signerRole, athlete?.$id))) {
    return res.json({ error: 'Complete the current required legal packet before booking.' }, 403);
  }

  const slot = await validateSlot(db, coach, { date, startTime, durationMinutes, excludeSessionId: null });
  if (slot.error) return res.json({ error: slot.error }, slot.status || 409);

  // Credit ownership + capacity.
  const credit = await db.getDocument(DB_ID, 'session_credits', creditId).catch(() => null);
  if (!credit) return res.json({ error: 'Credit not found.' }, 404);
  const ownsCredit = credit.client_profile_id
    ? credit.client_profile_id === profile.$id
    : String(credit.client_email || '').toLowerCase() === String(profile.email || '').toLowerCase();
  if (!ownsCredit) return res.json({ error: 'This credit does not belong to you.' }, 403);
  const total = Number(credit.total_credits) || 0;
  const used = Number(credit.used_credits) || 0;
  if (total - used <= 0) return res.json({ error: 'No remaining credits on this package.' }, 409);
  const creditDuration = Number(credit.session_duration_minutes) || 0;
  if (creditDuration > 0 && creditDuration !== durationMinutes) {
    return res.json({ error: `This credit is for ${creditDuration}-minute sessions.` }, 400);
  }

  // Decrement the credit before creating the session, then verify after.
  await db.updateDocument(DB_ID, 'session_credits', creditId, { used_credits: used + 1 });

  const guardianAccounts = await guardianAccountsForAthlete(db, athlete?.$id);
  let athleteAccount = '';
  if (athlete?.profile_id && athlete.profile_id !== profile.$id) {
    const owner = await db.getDocument(DB_ID, 'profiles', athlete.profile_id).catch(() => null);
    athleteAccount = owner?.account_id || '';
  }
  const permissions = [...new Set([
    Permission.read(Role.user(accountId)),
    ...(coach.user_id ? [Permission.read(Role.user(coach.user_id))] : []),
    ...(athleteAccount ? [Permission.read(Role.user(athleteAccount))] : []),
    ...guardianAccounts.map((id) => Permission.read(Role.user(id))),
  ])];

  let session;
  try {
    session = await createDocumentResilient(db, 'sessions', {
      coach_id: coach.$id,
      client_email: profile.email,
      client_name: athlete ? [athlete.first_name, athlete.last_name].filter(Boolean).join(' ') : fullName(profile),
      date,
      start_time: startTime,
      duration_minutes: durationMinutes,
      status: 'confirmed',
      payment_status: 'paid',
      payment_method: 'credits',
      credit_id: creditId,
      notes,
      athlete_id: athlete?.$id || '',
      booked_by_profile_id: profile.$id,
      timezone: slot.timezone,
      starts_at_utc: slot.startUtcIso,
    }, permissions);
  } catch (err) {
    await restoreCredit(db, creditId, error);
    throw err;
  }

  // Oversubscription guard: re-read the credit after creating the session.
  const recheck = await db.getDocument(DB_ID, 'session_credits', creditId).catch(() => null);
  if (recheck && (Number(recheck.used_credits) || 0) > (Number(recheck.total_credits) || 0)) {
    await db.deleteDocument(DB_ID, 'sessions', session.$id).catch(() => {});
    await db.updateDocument(DB_ID, 'session_credits', creditId, {
      used_credits: Math.max(0, (Number(recheck.used_credits) || 0) - 1),
    }).catch(() => {});
    return res.json({ error: 'That credit was just used by another booking.' }, 409);
  }

  const when = formatStart(slot.startUtcIso, slot.timezone);
  const coachName = [coach.first_name, coach.last_name].filter(Boolean).join(' ') || 'your coach';
  await notifyBothSides(db, {
    session, coach, profile,
    type: 'booking_confirmed',
    title: 'Session confirmed',
    coachMessage: `${session.client_name} booked a ${durationMinutes}-minute session on ${when}.`,
    clientMessage: `Your ${durationMinutes}-minute session with ${coachName} is confirmed for ${when}.`,
  });

  const subject = `LevelCoach session confirmed — ${date} ${startTime}`;
  await sendEmail({
    to: profile.email,
    subject,
    html: `
      <p>Hi ${escapeHtml(profile.first_name || 'there')},</p>
      <p>Your session with <strong>${escapeHtml(coachName)}</strong> is confirmed.</p>
      <p><strong>${escapeHtml(when)}</strong><br/>Duration: ${durationMinutes} minutes</p>
      <p>You can manage sessions from your LevelCoach Training dashboard.</p>
    `,
  }, error);
  await sendEmail({
    to: coach.email,
    subject,
    html: `
      <p>Hi ${escapeHtml(coach.first_name || 'Coach')},</p>
      <p>A session with <strong>${escapeHtml(session.client_name)}</strong> is confirmed.</p>
      <p><strong>${escapeHtml(when)}</strong><br/>Duration: ${durationMinutes} minutes</p>
    `,
  }, error);

  return res.json({ session });
}

async function cancelAction(db, users, accountId, profile, payload, res, error) {
  const sessionId = String(payload.session_id || '').trim();
  if (!sessionId) return res.json({ error: 'session_id is required.' }, 400);
  const reason = cleanText(payload.reason, 500);

  const session = await db.getDocument(DB_ID, 'sessions', sessionId).catch(() => null);
  if (!session) return res.json({ error: 'Session not found.' }, 404);
  if (!['pending', 'confirmed'].includes(session.status)) {
    return res.json({ error: 'Only pending or confirmed sessions can be cancelled.' }, 400);
  }

  const authority = await sessionAuthority(db, users, accountId, profile, session);
  if (!authority.any) return res.json({ error: 'You cannot cancel this session.' }, 403);

  // Policy: >=24h restores the credit; inside 24h forfeits unless the coach cancels.
  const startMs = sessionStartMs(session, authority.coach);
  const hoursUntil = startMs === null ? 0 : (startMs - Date.now()) / 3600000;
  const restore = authority.isCoach || hoursUntil >= 24;
  if (restore) await restoreCredit(db, session.credit_id, error);

  const updated = await updateDocumentResilient(db, 'sessions', session.$id, {
    status: 'cancelled',
    cancellation_reason: reason,
  });

  const when = `${session.date} ${session.start_time}`;
  await notifyBothSides(db, {
    session: updated, coach: authority.coach, profile,
    type: 'booking_cancelled',
    title: 'Session cancelled',
    coachMessage: `The session on ${when} was cancelled.`,
    clientMessage: restore
      ? `Your session on ${when} was cancelled and your credit was restored.`
      : `Your session on ${when} was cancelled. Per policy, the credit was forfeited.`,
  });

  return res.json({ session: updated, credit_restored: restore });
}

async function rescheduleAction(db, users, accountId, profile, payload, res, error) {
  const sessionId = String(payload.session_id || '').trim();
  const date = String(payload.date || '').trim();
  const startTime = String(payload.start_time || '').trim();
  if (!sessionId) return res.json({ error: 'session_id is required.' }, 400);
  if (!validDate(date)) return res.json({ error: 'date must be YYYY-MM-DD.' }, 400);
  if (!validTime(startTime)) return res.json({ error: 'start_time must be HH:MM.' }, 400);

  const session = await db.getDocument(DB_ID, 'sessions', sessionId).catch(() => null);
  if (!session) return res.json({ error: 'Session not found.' }, 404);
  if (!['pending', 'confirmed'].includes(session.status)) {
    return res.json({ error: 'Only pending or confirmed sessions can be rescheduled.' }, 400);
  }

  const authority = await sessionAuthority(db, users, accountId, profile, session);
  if (!authority.any) return res.json({ error: 'You cannot reschedule this session.' }, 403);
  if (!authority.coach) return res.json({ error: 'Coach not found for this session.' }, 404);

  const durationMinutes = payload.duration_minutes === undefined
    ? Number(session.duration_minutes) || 60
    : Number(payload.duration_minutes);
  if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 480) {
    return res.json({ error: 'duration_minutes must be an integer between 15 and 480.' }, 400);
  }
  if (session.credit_id && durationMinutes !== (Number(session.duration_minutes) || durationMinutes)) {
    const credit = await db.getDocument(DB_ID, 'session_credits', session.credit_id).catch(() => null);
    const creditDuration = Number(credit?.session_duration_minutes) || 0;
    if (creditDuration > 0 && creditDuration !== durationMinutes) {
      return res.json({ error: `This credit is for ${creditDuration}-minute sessions.` }, 400);
    }
  }

  const slot = await validateSlot(db, authority.coach, {
    date, startTime, durationMinutes, excludeSessionId: session.$id,
  });
  if (slot.error) return res.json({ error: slot.error }, slot.status || 409);

  const updated = await updateDocumentResilient(db, 'sessions', session.$id, {
    date,
    start_time: startTime,
    duration_minutes: durationMinutes,
    timezone: slot.timezone,
    starts_at_utc: slot.startUtcIso,
  });

  const when = formatStart(slot.startUtcIso, slot.timezone);
  await notifyBothSides(db, {
    session: updated, coach: authority.coach, profile,
    type: 'booking_rescheduled',
    title: 'Session rescheduled',
    coachMessage: `A session was rescheduled to ${when}.`,
    clientMessage: `Your session was rescheduled to ${when}.`,
  });

  return res.json({ session: updated });
}

async function statusAction(db, users, accountId, profile, payload, newStatus, res) {
  const sessionId = String(payload.session_id || '').trim();
  if (!sessionId) return res.json({ error: 'session_id is required.' }, 400);

  const session = await db.getDocument(DB_ID, 'sessions', sessionId).catch(() => null);
  if (!session) return res.json({ error: 'Session not found.' }, 404);
  if (session.status !== 'confirmed') {
    return res.json({ error: 'Only confirmed sessions can be updated.' }, 400);
  }

  const authority = await sessionAuthority(db, users, accountId, profile, session);
  if (!authority.isCoach && !authority.isAdmin) {
    const account = await users.get(accountId).catch(() => null);
    if (!isAdminLabel(account?.labels)) {
      return res.json({ error: 'Only the coach or an admin can do that.' }, 403);
    }
  }

  // no_show does not restore the credit; the credit stays consumed.
  const updated = await updateDocumentResilient(db, 'sessions', session.$id, { status: newStatus });
  return res.json({ session: updated });
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
      case 'book':
        return await bookAction(db, users, accountId, profile, payload, res, error);
      case 'cancel':
        return await cancelAction(db, users, accountId, profile, payload, res, error);
      case 'reschedule':
        return await rescheduleAction(db, users, accountId, profile, payload, res, error);
      case 'complete':
        return await statusAction(db, users, accountId, profile, payload, 'completed', res);
      case 'no_show':
        return await statusAction(db, users, accountId, profile, payload, 'no_show', res);
      default:
        return res.json({ error: 'Unknown action.' }, 400);
    }
  } catch (err) {
    error?.(err?.message || String(err));
    return res.json({ error: 'Could not process booking request.' }, 500);
  }
};
