import { Client, Databases, Users, ID, Query } from 'node-appwrite';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';

const DB_ID = process.env.APPWRITE_DATABASE_ID || 'lctraining';
const CODE_TTL_MS = 10 * 60 * 1000;          // verification codes live 10 minutes
const CODE_RATE_LIMIT = 3;                    // max codes per hour per coach
const MAX_CODE_ATTEMPTS = 5;

const SERVICE_TYPES = ['facility', 'travels', 'hybrid', 'online'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PUBLISH_POLICY_KEYS = ['coach_publish_policy', 'coach_safety_policy', 'coach_compliance_policy'];
const COMPLETE_STATUS_VALUES = new Set(['approved', 'clear', 'cleared', 'passed', 'complete', 'completed', 'verified', 'active', 'current', 'valid', 'yes', 'true']);
const INCOMPLETE_STATUS_VALUES = new Set(['', 'none', 'no', 'false', 'pending', 'required', 'missing', 'not_started', 'incomplete', 'failed', 'rejected', 'denied', 'expired']);

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

async function coachForAccount(databases, accountId) {
  const rows = await databases.listDocuments(DB_ID, 'coaches', [
    Query.equal('user_id', accountId),
    Query.limit(1),
  ]);
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

async function writeAudit(databases, entry) {
  const data = { ...entry };
  if (!['admin', 'super_admin'].includes(data.actor_role)) delete data.actor_role;
  await databases.createDocument(DB_ID, 'audit_logs', ID.unique(), data).catch(() => {});
}

function sha256(value) {
  return createHash('sha256').update(String(value || '')).digest('hex');
}

async function sendEmail({ to, subject, html }) {
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
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || data?.error || `Resend returned ${response.status}`);
  return data;
}

// --- Validation helpers -------------------------------------------------------

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

function num(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) return undefined;
  return n;
}

function strArray(value, maxItemLen, maxItems) {
  if (!Array.isArray(value) || value.length > maxItems) return undefined;
  const out = [];
  for (const item of value) {
    const s = str(item, 1, maxItemLen);
    if (s === undefined) return undefined;
    out.push(s);
  }
  return out;
}

function validTimezone(value) {
  const tz = str(value, 1, 64);
  if (tz === undefined) return undefined;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } catch { return undefined; }
}

function hasText(value) {
  return typeof value === 'string' ? value.trim().length > 0 : value !== undefined && value !== null && value !== '';
}

function asArray(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  if (typeof value === 'string' && value.trim()) return value.split(',').map((item) => item.trim()).filter(Boolean);
  return [];
}

function parseJsonObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function profileSections(row) {
  const source = parseJsonObject(row?.profile_sections);
  return {
    headline: String(source.headline || row?.headline || '').trim(),
    bio: String(source.bio || row?.bio || '').trim(),
    intro_video_url: String(source.intro_video_url || row?.intro_video_url || '').trim(),
  };
}

// Update the coach document, tolerating a live `coaches` collection that is
// missing newer attributes (the collection hit Appwrite's size limit before
// the marketplace fields could be added). On an "Unknown attribute" error we
// drop that key and retry, so the portal saves what the schema supports
// instead of hard-failing. Returns the updated doc (possibly with some fields
// skipped) or null when nothing could be written.
async function updateCoach(databases, coachId, updates) {
  const payload = { ...updates };
  for (let i = 0; i < 20; i += 1) {
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

async function createDocumentResilient(databases, collection, data) {
  const payload = { ...data };
  for (let i = 0; i < 12; i += 1) {
    try {
      return await databases.createDocument(DB_ID, collection, ID.unique(), payload);
    } catch (err) {
      const match = String(err?.message || '').match(/Unknown attribute:\s*"?([a-zA-Z0-9_]+)"?/);
      if (match && Object.prototype.hasOwnProperty.call(payload, match[1])) {
        delete payload[match[1]];
        continue;
      }
      throw err;
    }
  }
  return databases.createDocument(DB_ID, collection, ID.unique(), payload);
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

// Whitelisted self-service profile fields. Fee/verification/stripe/active/
// published/rating/user_id fields are intentionally absent.
const PROFILE_FIELDS = {
  first_name: (v) => str(v, 1, 100),
  last_name: (v) => str(v, 1, 100),
  bio: (v) => str(v, 0, 20000),
  quote: (v) => str(v, 0, 1000),
  photo_url: (v) => str(v, 0, 1000),
  phone: (v) => str(v, 0, 30),
  training_area: (v) => str(v, 0, 255),
  service_city: (v) => str(v, 0, 120),
  service_state: (v) => str(v, 0, 30),
  service_zip: (v) => str(v, 0, 20),
  service_radius_miles: (v) => int(v, 0, 250),
  service_type: (v) => (SERVICE_TYPES.includes(v) ? v : undefined),
  service_venue: (v) => str(v, 0, 500),
  service_counties: (v) => strArray(v, 100, 30),
  location_lat: (v) => num(v, -90, 90),
  location_lng: (v) => num(v, -180, 180),
  specializations: (v) => strArray(v, 100, 30),
  sports: (v) => strArray(v, 100, 20),
  timezone: (v) => validTimezone(v),
  intro_video_url: (v) => str(v, 0, 1000),
  price_hint_cents: (v) => int(v, 0, 1000000),
};

// --- Action handlers ----------------------------------------------------------

// Owner-only: return the caller's own coach, with email / email_verified_at /
// phone resolved private-first (coach_private), falling back to any legacy
// value still on the coach doc during the transition. Never returns another
// coach's private data — `coach` is already resolved to the caller.
async function getSelf(databases, coach) {
  const activeCoach = await updateDocumentResilient(databases, 'coaches', coach.$id, {
    last_active_at: new Date().toISOString(),
  }).catch(() => coach);
  const priv = await getCoachPrivate(databases, coach.$id);
  return {
    status: 200,
    body: {
      ok: true,
      coach: {
        ...activeCoach,
        email: priv?.email ?? activeCoach.email ?? '',
        email_verified_at: priv?.email_verified_at ?? activeCoach.email_verified_at ?? null,
        phone: priv?.phone ?? activeCoach.phone ?? '',
      },
    },
  };
}

async function updateProfile(databases, coach, payload) {
  const updates = {};
  for (const [key, validate] of Object.entries(PROFILE_FIELDS)) {
    if (!(key in payload)) continue;
    const value = validate(payload[key]);
    if (value === undefined) return { status: 400, body: { error: `Invalid value for ${key}.` } };
    updates[key] = value;
  }
  if (Object.keys(updates).length === 0) {
    return { status: 400, body: { error: 'No updatable fields provided.' } };
  }
  // phone is PII: it lives in coach_private, not on the public-ish coach doc.
  let phonePatched;
  if ('phone' in updates) {
    phonePatched = updates.phone;
    delete updates.phone;
    await upsertCoachPrivate(databases, coach.$id, { phone: phonePatched });
  }
  const updated = Object.keys(updates).length
    ? await updateCoach(databases, coach.$id, updates)
    : coach;
  if (phonePatched !== undefined) updated.phone = phonePatched;
  return { status: 200, body: { coach: updated } };
}

async function setAvailability(databases, coach, payload) {
  let availability = payload.availability;
  if (typeof availability === 'string') {
    try { availability = JSON.parse(availability); } catch { availability = null; }
  }
  if (!availability || typeof availability !== 'object') {
    return { status: 400, body: { error: 'availability must be a JSON object.' } };
  }
  const serialized = JSON.stringify(availability);
  if (serialized.length > 20000) return { status: 400, body: { error: 'availability is too large.' } };
  await updateCoach(databases, coach.$id, { availability: serialized });
  return { status: 200, body: { ok: true } };
}

function validateBlock(block) {
  if (!block || typeof block !== 'object') return null;
  const label = str(block.label ?? '', 0, 200);
  const startDate = String(block.start_date || '');
  const endDate = String(block.end_date || '');
  if (label === undefined) return null;
  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate) || startDate > endDate) return null;
  const allDay = block.block_all_day !== false;
  const out = {
    label,
    start_date: startDate,
    end_date: endDate,
    block_all_day: allDay,
    is_active: block.is_active !== false,
  };
  if (!allDay) {
    const startTime = String(block.blocked_start_time || '');
    const endTime = String(block.blocked_end_time || '');
    if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime) || startTime >= endTime) return null;
    out.blocked_start_time = startTime;
    out.blocked_end_time = endTime;
  }
  return out;
}

async function setBlocks(databases, coach, payload) {
  const blocks = Array.isArray(payload.blocks) ? payload.blocks : null;
  if (!blocks || blocks.length > 100) {
    return { status: 400, body: { error: 'blocks must be an array of at most 100 entries.' } };
  }
  const validated = [];
  for (const block of blocks) {
    const clean = validateBlock(block);
    if (!clean) return { status: 400, body: { error: 'One or more blocks are invalid.' } };
    validated.push(clean);
  }

  // Replace this coach's rows: delete existing then recreate.
  let cursor = null;
  const existing = [];
  for (;;) {
    const page = await databases.listDocuments(DB_ID, 'coach_blocks', [
      Query.equal('coach_id', coach.$id),
      Query.limit(100),
      ...(cursor ? [Query.cursorAfter(cursor)] : []),
    ]);
    existing.push(...page.documents);
    if (page.documents.length < 100) break;
    cursor = page.documents[page.documents.length - 1].$id;
  }
  for (const doc of existing) {
    await databases.deleteDocument(DB_ID, 'coach_blocks', doc.$id);
  }
  const created = [];
  for (const block of validated) {
    const doc = await databases.createDocument(DB_ID, 'coach_blocks', ID.unique(), {
      ...block,
      coach_id: coach.$id,
    });
    created.push(doc.$id);
  }
  return { status: 200, body: { ok: true, block_ids: created } };
}

async function setSportProfiles(databases, coach, payload) {
  const profiles = Array.isArray(payload.profiles) ? payload.profiles : null;
  if (!profiles || profiles.length === 0 || profiles.length > 15) {
    return { status: 400, body: { error: 'profiles must be an array of 1 to 15 entries.' } };
  }
  const cleaned = [];
  for (const item of profiles) {
    const sportKey = str(item?.sport_key, 1, 100);
    if (sportKey === undefined) return { status: 400, body: { error: 'Each profile requires a sport_key.' } };
    const specialties = strArray(item.specialties ?? [], 120, 20);
    const levels = strArray(item.levels ?? [], 120, 20);
    const positions = strArray(item.positions ?? [], 120, 20);
    const sessionTypes = strArray(item.session_types ?? [], 120, 20);
    const credentials = str(item.credentials ?? '', 0, 20000);
    const sections = profileSections(item);
    const headline = str(sections.headline, 0, 300);
    const bio = str(sections.bio, 0, 20000);
    const introVideoUrl = str(sections.intro_video_url, 0, 1000);
    if ([specialties, levels, positions, sessionTypes, credentials, headline, bio, introVideoUrl].some((v) => v === undefined)) {
      return { status: 400, body: { error: `Invalid sport profile for ${sportKey}.` } };
    }
    cleaned.push({
      sport_key: sportKey,
      specialties,
      levels,
      positions,
      session_types: sessionTypes,
      credentials,
      profile_sections: JSON.stringify({
        headline,
        bio,
        intro_video_url: introVideoUrl,
      }),
    });
  }

  // Every sport_key must exist in the sports collection.
  const keys = [...new Set(cleaned.map((p) => p.sport_key))];
  const known = await databases.listDocuments(DB_ID, 'sports', [
    Query.equal('sport_key', keys),
    Query.limit(keys.length),
  ]);
  const knownKeys = new Set(known.documents.map((s) => s.sport_key));
  const unknown = keys.filter((key) => !knownKeys.has(key));
  if (unknown.length > 0) {
    return { status: 400, body: { error: `Unknown sport(s): ${unknown.join(', ')}.` } };
  }

  const existingRows = await databases.listDocuments(DB_ID, 'coach_sport_profiles', [
    Query.equal('coach_id', coach.$id),
    Query.limit(100),
  ]);
  const bySport = new Map(existingRows.documents.map((doc) => [doc.sport_key, doc]));
  const ids = [];
  for (const profile of cleaned) {
    const existing = bySport.get(profile.sport_key);
    const doc = existing
      ? await databases.updateDocument(DB_ID, 'coach_sport_profiles', existing.$id, profile)
      : await databases.createDocument(DB_ID, 'coach_sport_profiles', ID.unique(), {
        ...profile,
        coach_id: coach.$id,
      });
    ids.push(doc.$id);
  }
  return { status: 200, body: { ok: true, profile_ids: ids } };
}

async function setBookingRules(databases, coach, payload) {
  const minNotice = int(payload.min_notice_hours, 0, 168);
  const buffer = int(payload.buffer_minutes, 0, 120);
  const maxAdvance = int(payload.max_advance_days, 1, 365);
  if (minNotice === undefined || buffer === undefined || maxAdvance === undefined) {
    return { status: 400, body: { error: 'min_notice_hours (0-168), buffer_minutes (0-120), and max_advance_days (1-365) are required integers.' } };
  }
  const rules = { min_notice_hours: minNotice, buffer_minutes: buffer, max_advance_days: maxAdvance };
  await updateCoach(databases, coach.$id, { booking_rules: JSON.stringify(rules) });
  return { status: 200, body: { ok: true, booking_rules: rules } };
}

// --- Packages (per-coach, self-contained pricing) -------------------------------
// Each coach owns their packages. A package is a complete offering: N sessions
// of duration_minutes for price_cents total. Marketplace pricing — the platform
// never dictates a coach's prices.

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

function cleanPackageId(value) {
  const id = String(value || '').trim();
  if (!id || id === 'null' || id === 'undefined') return '';
  return id;
}

async function listPackages(databases, coach) {
  const rows = await databases.listDocuments(DB_ID, 'pricing_packages', [
    Query.equal('coach_id', coach.$id),
    Query.limit(100),
  ]).catch(() => ({ documents: [] }));
  const packages = rows.documents
    .map(packageView)
    .sort((a, b) => a.display_order - b.display_order || a.price_cents - b.price_cents);
  return { status: 200, body: { packages } };
}

async function savePackage(databases, coach, payload) {
  const packageId = cleanPackageId(payload.package_id || payload.id);
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
  const isSingleSession = sessions === 1 && name.trim().toLowerCase() === 'single session';
  const coachSportKeys = asArray(coach.sports).map((sport) => sport.toLowerCase());
  const unknownSportKeys = sportKeys.filter((sport) => coachSportKeys.length > 0 && !coachSportKeys.includes(sport));
  if (unknownSportKeys.length) {
    return { status: 400, body: { error: `Package sport must match your selected sports: ${unknownSportKeys.join(', ')}.` } };
  }
  if (coachSportKeys.length > 1 && sportKeys.length === 0) {
    return { status: 400, body: { error: 'Choose which sport this package belongs to.' } };
  }

  const data = {
    coach_id: coach.$id,
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
    display_order: isSingleSession ? 0 : displayOrder,
    is_active: isActive,
    is_visible: isActive,                  // legacy visibility mirror
  };

  let doc;
  if (packageId) {
    let existing = await databases.getDocument(DB_ID, 'pricing_packages', packageId).catch(() => null);
    if (existing && existing.coach_id !== coach.$id) {
      return { status: 403, body: { error: 'You can only edit your own packages.' } };
    }
    if (!existing) {
      const rows = await databases.listDocuments(DB_ID, 'pricing_packages', [
        Query.equal('coach_id', coach.$id),
        Query.limit(100),
      ]).catch(() => ({ documents: [] }));
      existing = rows.documents.find((pkg) =>
        String(pkg.name || '').trim().toLowerCase() === name.toLowerCase()
        && Number(pkg.sessions || 1) === sessions
        && String(pkg.session_type || '') === sessionType
      ) || null;
    }
    doc = existing
      ? await updateDocumentResilient(databases, 'pricing_packages', existing.$id, data)
      : await createDocumentResilient(databases, 'pricing_packages', data);
  } else {
    doc = await createDocumentResilient(databases, 'pricing_packages', data);
  }
  if (isSingleSession && isActive) {
    await updateCoach(databases, coach.$id, { price_hint_cents: primary.price_cents }).catch(() => null);
  }
  return { status: 200, body: { ok: true, package: packageView(doc) } };
}

async function deletePackage(databases, coach, payload) {
  const id = String(payload.package_id || '');
  if (!id) return { status: 400, body: { error: 'package_id is required.' } };
  const existing = await databases.getDocument(DB_ID, 'pricing_packages', id).catch(() => null);
  if (!existing) return { status: 404, body: { error: 'Package not found.' } };
  if (existing.coach_id !== coach.$id) return { status: 403, body: { error: 'You can only delete your own packages.' } };
  await databases.deleteDocument(DB_ID, 'pricing_packages', id);
  return { status: 200, body: { ok: true } };
}

async function hasActivePackage(databases, coach) {
  const rows = await databases.listDocuments(DB_ID, 'pricing_packages', [
    Query.equal('coach_id', coach.$id),
    Query.equal('is_active', true),
    Query.limit(1),
  ]).catch(() => ({ documents: [] }));
  return rows.documents.length > 0;
}

function startingPriceCents(coach) {
  const cents = Number(coach.price_hint_cents);
  return Number.isInteger(cents) && cents >= MIN_PRICE_CENTS && cents <= MAX_PRICE_CENTS ? cents : null;
}

async function ensureStarterPackageFromPriceHint(databases, coach) {
  if (await hasActivePackage(databases, coach)) return { done: true, created: false };
  const priceCents = startingPriceCents(coach);
  if (!priceCents) return { done: false, created: false };

  const durationOptions = [{ duration_minutes: 60, price_cents: priceCents }];
  await createDocumentResilient(databases, 'pricing_packages', {
    coach_id: coach.$id,
    organization_id: '',
    name: 'Single Session',
    sessions: 1,
    duration_minutes: 60,
    duration_options: JSON.stringify(durationOptions),
    price_cents: priceCents,
    price: priceCents / 100,
    session_type: 'private',
    description: 'One private training session.',
    includes: [],
    badge: '',
    sport_keys: asArray(coach.sports),
    location_formats: [],
    display_order: 0,
    is_active: true,
    is_visible: true,
  });
  return { done: true, created: true };
}

async function requestEmailCode(databases, coach, payload, error) {
  const priv = await getCoachPrivate(databases, coach.$id);
  const currentEmail = priv?.email ?? coach.email ?? '';
  const target = String(payload.email || currentEmail || '').trim().toLowerCase();
  if (!EMAIL_RE.test(target) || target.length > 254) {
    return { status: 400, body: { error: 'A valid email address is required.' } };
  }

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const recent = await databases.listDocuments(DB_ID, 'coach_link_requests', [
    Query.equal('coach_id', coach.$id),
    Query.greaterThan('$createdAt', hourAgo),
    Query.limit(CODE_RATE_LIMIT),
  ]);
  if (recent.documents.length >= CODE_RATE_LIMIT) {
    return { status: 429, body: { error: 'Too many verification codes requested. Try again later.' } };
  }

  // Server-generated 6-digit code; only its hash is stored.
  const code = String(randomInt(100000, 1000000));
  await databases.createDocument(DB_ID, 'coach_link_requests', ID.unique(), {
    email: target,
    coach_id: coach.$id,
    token: sha256(code),
    status: 'pending',
    attempts: 0,
    expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  });

  try {
    await sendEmail({
      to: target,
      subject: 'LevelCoach Training - Email Verification Code',
      html: `
        <p>Enter this code in your coach profile to verify your email address:</p>
        <p style="font-size:28px; font-weight:700; letter-spacing:6px;">${code}</p>
        <p>This code expires in 10 minutes. If you did not request it, you can ignore this email.</p>
      `,
    });
  } catch (err) {
    error?.(`verification email failed: ${err?.message || err}`);
    return { status: 500, body: { error: 'Could not send verification email.' } };
  }
  return { status: 200, body: { ok: true } };
}

async function confirmEmailCode(databases, coach, payload) {
  const code = String(payload.code || '').trim();
  if (!/^\d{6}$/.test(code)) return { status: 400, body: { error: 'A 6-digit code is required.' } };

  const rows = await databases.listDocuments(DB_ID, 'coach_link_requests', [
    Query.equal('coach_id', coach.$id),
    Query.equal('status', 'pending'),
    Query.orderDesc('$createdAt'),
    Query.limit(1),
  ]);
  const request = rows.documents[0];
  if (!request) return { status: 400, body: { error: 'No pending verification code. Request a new one.' } };
  if (request.expires_at && new Date(request.expires_at).getTime() < Date.now()) {
    await databases.updateDocument(DB_ID, 'coach_link_requests', request.$id, { status: 'expired' }).catch(() => {});
    return { status: 400, body: { error: 'This code has expired. Request a new one.' } };
  }
  if ((request.attempts || 0) >= MAX_CODE_ATTEMPTS) {
    await databases.updateDocument(DB_ID, 'coach_link_requests', request.$id, { status: 'expired' }).catch(() => {});
    return { status: 400, body: { error: 'Too many attempts. Request a new code.' } };
  }

  const expected = Buffer.from(String(request.token || ''), 'utf8');
  const provided = Buffer.from(sha256(code), 'utf8');
  const matches = expected.length === provided.length && timingSafeEqual(expected, provided);
  if (!matches) {
    await databases.updateDocument(DB_ID, 'coach_link_requests', request.$id, {
      attempts: (request.attempts || 0) + 1,
    }).catch(() => {});
    return { status: 400, body: { error: 'Incorrect verification code.' } };
  }

  await databases.updateDocument(DB_ID, 'coach_link_requests', request.$id, { status: 'verified' });
  // PII (email / email_verified_at) lives in coach_private now — never the
  // coaches doc. Always persist the verified email so the private row is the
  // source of truth even if the coach doc still holds a legacy value.
  const verifiedAt = new Date().toISOString();
  const privateFields = { email_verified_at: verifiedAt };
  if (request.email) privateFields.email = request.email;
  await upsertCoachPrivate(databases, coach.$id, privateFields);
  return { status: 200, body: { ok: true, email_verified_at: verifiedAt } };
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

async function coachLegalPacketComplete(databases, profile, coach) {
  const [templateRows, agreementRows] = await Promise.all([
    databases.listDocuments(DB_ID, 'legal_templates', [
      Query.equal('role', ['coach', 'platform']),
      Query.equal('required', true),
      Query.limit(100),
    ]),
    databases.listDocuments(DB_ID, 'legal_agreements', [
      Query.equal('signer_profile_id', profile.$id),
      Query.equal('signer_role', 'coach'),
      Query.equal('status', 'signed'),
      Query.limit(200),
    ]),
  ]);
  const templates = templateRows.documents.filter(activeRequired);
  if (templates.length === 0) return false;
  return templates.every((template) =>
    agreementRows.documents.some((agreement) =>
      (template.role === 'platform' || !agreement.coach_id || agreement.coach_id === coach.$id) && agreementMatchesTemplate(agreement, template)
    )
  );
}

async function connectReady(databases, coach) {
  const rows = await databases.listDocuments(DB_ID, 'stripe_connected_accounts', [
    Query.equal('owner_type', 'coach'),
    Query.equal('owner_id', coach.$id),
    Query.limit(10),
  ]).catch(() => ({ documents: [] }));
  return rows.documents.some((row) => row.charges_enabled && row.payouts_enabled);
}

async function hasAvailability(databases, coach) {
  if (typeof coach.availability === 'string' && coach.availability.trim()) {
    try {
      const parsed = JSON.parse(coach.availability);
      if (Array.isArray(parsed)) {
        if (parsed.length > 0) return true;
      } else if (parsed && typeof parsed === 'object') {
        // Legacy weekly map: valid only when at least one day is enabled
        // (mirror client weeklyAvailabilitySet). An all-days-disabled object
        // would pass a bare key-count check yet be unbookable on every day,
        // so fall through to the availability_blocks check instead.
        if (Object.values(parsed).some((d) => d?.enabled)) return true;
      }
    } catch { /* fall through to blocks */ }
  }
  const rows = await databases.listDocuments(DB_ID, 'availability_blocks', [
    Query.equal('coach_id', coach.$id),
    Query.equal('active', true),
    Query.limit(25),
  ]).catch(() => ({ documents: [] }));
  return rows.documents.some((row) => row.block_type !== 'blackout');
}

function hasSelectedSport(coach) {
  return asArray(coach.sports).length > 0;
}

function completeSportProfile(row) {
  const sections = profileSections(row);
  return asArray(row?.specialties).length > 0
    && asArray(row?.levels).length > 0
    && asArray(row?.session_types).length > 0
    && hasText(row?.credentials)
    && (hasText(sections.bio) || hasText(sections.headline));
}

async function hasCompleteSportProfile(databases, coach) {
  const rows = await databases.listDocuments(DB_ID, 'coach_sport_profiles', [
    Query.equal('coach_id', coach.$id),
    Query.limit(100),
  ]).catch(() => ({ documents: [] }));
  const selectedSports = asArray(coach.sports).map((sport) => sport.toLowerCase());
  if (selectedSports.length > 1) {
    const completeSports = new Set(
      rows.documents
        .filter(completeSportProfile)
        .map((row) => String(row.sport_key || '').trim().toLowerCase())
        .filter(Boolean),
    );
    return selectedSports.every((sportKey) => completeSports.has(sportKey));
  }
  return rows.documents.some(completeSportProfile);
}

function serviceLocationComplete(coach) {
  const serviceType = String(coach.service_type || '').trim();
  if (!SERVICE_TYPES.includes(serviceType)) return false;
  if (!hasText(coach.service_city) || !hasText(coach.service_state) || !hasText(coach.service_zip)) return false;
  if ((serviceType === 'facility' || serviceType === 'hybrid') && !hasText(coach.service_venue)) return false;
  if (serviceType === 'travels' || serviceType === 'hybrid') {
    const radius = Number(coach.service_radius_miles);
    if (!Number.isFinite(radius) || radius <= 0) return false;
  }
  return true;
}

async function linkedAccountExists(users, coach) {
  const userId = String(coach.user_id || '').trim();
  if (!userId) return false;
  const account = await users.get(userId).catch(() => null);
  return !!account?.$id;
}

async function loadPublishPolicy(databases) {
  for (const key of PUBLISH_POLICY_KEYS) {
    const rows = await databases.listDocuments(DB_ID, 'site_content', [
      Query.equal('key', key),
      Query.limit(1),
    ]).catch(() => ({ documents: [] }));
    const raw = rows.documents[0]?.value;
    if (!raw) continue;
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {
      // Ignore malformed optional policy rows; admins can fix the content row
      // without blocking all coach publishing.
    }
  }
  return null;
}

function policyRequiredFields(policy) {
  if (!policy || typeof policy !== 'object') return [];
  const fields = new Set();
  const add = (value) => {
    if (Array.isArray(value)) {
      for (const item of value) if (hasText(item)) fields.add(String(item).trim());
    }
  };
  add(policy.required_fields);
  add(policy.requiredFields);
  add(policy.safety?.required_fields);
  add(policy.safety?.requiredFields);
  add(policy.insurance?.required_fields);
  add(policy.insurance?.requiredFields);
  return [...fields].filter((field) => !String(field || '').toLowerCase().includes('background'));
}

function anyFieldComplete(source, fields, acceptedValues = {}) {
  return fields.some((field) => {
    const value = source[field];
    if (value === true) return true;
    if (value === false || value === undefined || value === null) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (field.endsWith('_expires_at') || field.endsWith('_expiration_date')) {
      const ts = Date.parse(String(value));
      return Number.isFinite(ts) && ts > Date.now();
    }
    const normalized = String(value).trim().toLowerCase();
    if (Array.isArray(acceptedValues[field])) {
      return acceptedValues[field].map((item) => String(item).trim().toLowerCase()).includes(normalized);
    }
    if (COMPLETE_STATUS_VALUES.has(normalized)) return true;
    if (INCOMPLETE_STATUS_VALUES.has(normalized)) return false;
    return normalized.length > 0;
  });
}

async function safetyPolicyStatus(databases, coach, profile, priv) {
  const policy = await loadPublishPolicy(databases);
  if (!policy) return { done: true, details: [], configured: false };

  const source = { ...profile, ...coach, ...priv };
  const acceptedValues = policy.accepted_values || policy.acceptedValues || {};
  const missing = [];

  for (const field of policyRequiredFields(policy)) {
    if (!anyFieldComplete(source, [field], acceptedValues)) missing.push(field);
  }

  const requireInsurance = policy.require_insurance === true
    || policy.requireInsurance === true
    || policy.insurance?.required === true;
  if (requireInsurance && !anyFieldComplete(source, [
    'insurance_status',
    'insurance_verified_at',
    'insurance_expires_at',
    'insurance_policy_number',
    'insurance_document_file_id',
  ], acceptedValues)) {
    missing.push('insurance');
  }

  const requireSafetyTraining = policy.require_safety_training === true
    || policy.requireSafetyTraining === true
    || policy.safety?.required === true;
  if (requireSafetyTraining && !anyFieldComplete(source, [
    'safety_training_status',
    'safety_training_completed_at',
    'safety_certification_status',
  ], acceptedValues)) {
    missing.push('safety_training');
  }

  return { done: missing.length === 0, details: [...new Set(missing)], configured: true };
}

function checklistItem(key, label, done, description, details = []) {
  return {
    key,
    label,
    description,
    done: done === true,
    blocking: done !== true,
    details,
  };
}

async function buildPublishChecklist(databases, users, profile, coach) {
  const priv = await getCoachPrivate(databases, coach.$id);
  const emailVerifiedAt = priv?.email_verified_at ?? coach.email_verified_at ?? null;
  const starterPrice = startingPriceCents(coach);
  const pricingStatus = await ensureStarterPackageFromPriceHint(databases, coach);
  const [
    linked,
    legal,
    connect,
    sportProfile,
    availability,
    safety,
  ] = await Promise.all([
    linkedAccountExists(users, coach),
    coachLegalPacketComplete(databases, profile, coach),
    connectReady(databases, coach),
    hasCompleteSportProfile(databases, coach),
    hasAvailability(databases, coach),
    safetyPolicyStatus(databases, coach, profile, priv),
  ]);

  const items = [
    checklistItem('linked_account', 'Linked user account exists', linked, 'An Appwrite user account must be linked to this coach record.'),
    checklistItem('legal_packet', 'Coach legal packet signed', legal, 'All active required coach legal templates must be signed.'),
    checklistItem('email_verification', 'Coach email verified', !!emailVerifiedAt, 'The coach contact email must be verified through the coach portal.'),
    checklistItem('stripe_connect', 'Stripe Connect ready', connect, 'The coach connected account must have charges_enabled and payouts_enabled.'),
    checklistItem('active', 'Coach is active', coach.is_active === true, 'An admin must keep this coach active before they can publish.'),
    checklistItem('name', 'First and last name present', hasText(coach.first_name) && hasText(coach.last_name), 'Both first_name and last_name are required.'),
    checklistItem('bio_or_quote', 'Bio or headline present', hasText(coach.bio) || hasText(coach.quote), 'Add either a public bio or a short headline/quote.'),
    checklistItem('sport', 'At least one sport selected', hasSelectedSport(coach), 'Choose at least one sport from the coach profile.'),
    checklistItem('sport_profile', 'Sport profiles complete', sportProfile, 'Every selected sport needs a headline or bio, credentials, specialties, levels, and session types.'),
    checklistItem('service_location', 'Service location complete', serviceLocationComplete(coach), 'Set service type, city, state, ZIP, and required venue/radius details.'),
    checklistItem('timezone', 'Timezone set', !!validTimezone(coach.timezone), 'Choose the timezone used for availability and bookings.'),
    checklistItem('availability', 'Availability exists', availability, 'Add weekly availability or active availability blocks.'),
    checklistItem('starting_price', 'Starting price set', !!starterPrice, 'Set Starting price (USD per session) in the coach profile.'),
    checklistItem('pricing', 'Active pricing package exists', pricingStatus.done, pricingStatus.created
      ? 'A Single Session package was created automatically from the starting price.'
      : 'Create at least one active pricing package, or set a starting price so one can be created automatically.'),
    checklistItem('safety_policy', 'Safety policy complete', safety.done, 'Configured site policy requirements must be complete.', safety.details),
  ];
  const missing = items.filter((item) => !item.done).map((item) => item.key);
  return {
    publishable: missing.length === 0,
    missing,
    checklist: items,
    policy_configured: safety.configured,
  };
}

async function publishChecklist(databases, users, profile, coach) {
  const result = await buildPublishChecklist(databases, users, profile, coach);
  return { status: 200, body: { ok: true, ...result } };
}

async function publish(databases, users, profile, coach) {
  const checklist = await buildPublishChecklist(databases, users, profile, coach);
  if (!checklist.publishable) {
    return { status: 400, body: { error: 'Publish requirements not met.', ...checklist } };
  }
  await updateCoach(databases, coach.$id, { published: true });
  await writeAudit(databases, {
    actor_email: profile.email || '',
    action: 'coach.publish',
    entity_type: 'Coach',
    entity_id: coach.$id,
    after: JSON.stringify({ published: true }),
    metadata: JSON.stringify({ profile_id: profile.$id }),
  });
  return { status: 200, body: { ok: true, published: true, ...checklist } };
}

async function unpublish(databases, profile, coach) {
  await updateCoach(databases, coach.$id, { published: false });
  await writeAudit(databases, {
    actor_email: profile.email || '',
    action: 'coach.unpublish',
    entity_type: 'Coach',
    entity_id: coach.$id,
    after: JSON.stringify({ published: false }),
    metadata: JSON.stringify({ profile_id: profile.$id }),
  });
  return { status: 200, body: { ok: true, published: false } };
}

// --- Entrypoint -----------------------------------------------------------------

export default async ({ req, res, error }) => {
  try {
    const accountId = callerAccountId(req);
    if (!accountId) return res.json({ error: 'Authentication required.' }, 401);

    const { databases, users } = services();
    const account = await users.get(accountId).catch(() => null);
    // The coach LABEL is the coach-surface capability bit. It stacks alongside
    // admin/superadmin (all link paths grant it without demoting the role), and
    // it must stay the sole gate here so that revoking it (role editor /
    // unlink) actually turns coach access off — admins do not bypass this.
    if (!account?.labels?.includes('coach')) {
      return res.json({ error: 'Coach access required.' }, 403);
    }
    const profile = await profileForAccount(databases, accountId);
    if (!profile) return res.json({ error: 'No profile found for this account.' }, 404);
    if (await callerIsBanned(databases, profile)) {
      return res.json({ error: 'Account access is restricted.' }, 403);
    }
    const coach = await coachForAccount(databases, accountId);
    if (!coach) return res.json({ error: 'No coach record is linked to this account.' }, 403);

    const payload = body(req);
    let result;
    switch (payload.action) {
      case 'getSelf':
        result = await getSelf(databases, coach);
        break;
      case 'updateProfile':
        result = await updateProfile(databases, coach, payload);
        break;
      case 'setAvailability':
        result = await setAvailability(databases, coach, payload);
        break;
      case 'setBlocks':
        result = await setBlocks(databases, coach, payload);
        break;
      case 'setSportProfiles':
        result = await setSportProfiles(databases, coach, payload);
        break;
      case 'setBookingRules':
        result = await setBookingRules(databases, coach, payload);
        break;
      case 'listPackages':
        result = await listPackages(databases, coach);
        break;
      case 'savePackage':
        result = await savePackage(databases, coach, payload);
        break;
      case 'deletePackage':
        result = await deletePackage(databases, coach, payload);
        break;
      case 'requestEmailCode':
        result = await requestEmailCode(databases, coach, payload, error);
        break;
      case 'confirmEmailCode':
        result = await confirmEmailCode(databases, coach, payload);
        break;
      case 'publishChecklist':
        result = await publishChecklist(databases, users, profile, coach);
        break;
      case 'publish':
        result = await publish(databases, users, profile, coach);
        break;
      case 'unpublish':
        result = await unpublish(databases, profile, coach);
        break;
      default:
        result = { status: 400, body: { error: 'Unknown action.' } };
    }
    return res.json(result.body, result.status);
  } catch (err) {
    error?.(err?.message || String(err));
    return res.json({ error: 'Coach request failed.' }, 500);
  }
};
