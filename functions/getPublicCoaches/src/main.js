// Public marketplace cards. Only active published coaches; PII
// (email/phone/user_id), Stripe IDs, verification notes, and platform fee
// fields are never returned.
import { Client, Databases, Query } from 'node-appwrite';

const DB_ID = process.env.APPWRITE_DATABASE_ID || 'lctraining';

function db() {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://nyc.cloud.appwrite.io/v1')
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);
  return new Databases(client);
}

function parseAvailability(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

function hasText(value) {
  return typeof value === 'string' ? value.trim().length > 0 : value !== undefined && value !== null && value !== '';
}

function asArray(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  if (typeof value === 'string' && value.trim()) return value.split(',').map((item) => item.trim()).filter(Boolean);
  return [];
}

function hasAnyAvailability(doc) {
  const availability = parseAvailability(doc.availability);
  if (Array.isArray(availability)) return availability.length > 0;
  if (availability && typeof availability === 'object') {
    return Object.values(availability).some((day) => day?.enabled === true);
  }
  return false;
}

function publicMinimumComplete(doc, hasAvailabilityBlock = false) {
  return hasText(doc.first_name)
    && hasText(doc.last_name)
    && (hasText(doc.bio) || hasText(doc.quote))
    && asArray(doc.sports).length > 0
    && hasText(doc.service_city)
    && hasText(doc.service_state)
    && hasText(doc.service_zip)
    && hasText(doc.timezone)
    && (hasAnyAvailability(doc) || hasAvailabilityBlock);
}

// Explicit allowlist — anything not listed here never leaves the server.
function publicCard(doc, organization, stats = null) {
  const publicStats = stats || {};
  return {
    id: doc.$id,
    first_name: doc.first_name || '',
    last_name: doc.last_name || '',
    bio: doc.bio || '',
    quote: doc.quote || '',
    photo_url: doc.photo_url || '',
    intro_video_url: doc.intro_video_url || '',
    specializations: doc.specializations || [],
    sports: doc.sports || [],
    rating_avg: Number.isFinite(Number(doc.rating_avg)) ? Number(doc.rating_avg) : 0,
    review_count: Number.isInteger(Number(doc.review_count)) ? Number(doc.review_count) : 0,
    price_hint_cents: Number.isInteger(Number(doc.price_hint_cents)) ? Number(doc.price_hint_cents) : null,
    sessions_taught: Number.isInteger(Number(publicStats.sessions_taught)) ? Number(publicStats.sessions_taught) : 0,
    active_athletes: Number.isInteger(Number(publicStats.active_athletes)) ? Number(publicStats.active_athletes) : 0,
    last_active_at: doc.last_active_at || doc.$updatedAt || '',
    county: doc.county || '',
    training_area: doc.training_area || '',
    service_city: doc.service_city || '',
    service_state: doc.service_state || '',
    service_zip: doc.service_zip || '',
    service_radius_miles: doc.service_radius_miles ?? null,
    service_type: doc.service_type || '',
    service_venue: doc.service_venue || '',
    service_counties: doc.service_counties || [],
    location_lat: doc.location_lat ?? null,
    location_lng: doc.location_lng ?? null,
    timezone: doc.timezone || '',
    availability: parseAvailability(doc.availability),
    is_head_coach: doc.is_head_coach === true,
    display_order: doc.display_order ?? 0,
    public_verified: true,
    organization: organization || null,
  };
}

async function listSessionsForCoaches(databases, coachIds) {
  const out = [];
  for (let i = 0; i < coachIds.length; i += 100) {
    const ids = coachIds.slice(i, i + 100);
    let cursor = null;
    while (true) {
      const page = await databases.listDocuments(DB_ID, 'sessions', [
        Query.equal('coach_id', ids),
        Query.limit(100),
        ...(cursor ? [Query.cursorAfter(cursor)] : []),
      ]).catch(() => ({ documents: [] }));
      out.push(...page.documents);
      if (page.documents.length < 100) break;
      cursor = page.documents[page.documents.length - 1].$id;
    }
  }
  return out;
}

function sessionDateMs(session) {
  const direct = Date.parse(String(session.starts_at_utc || ''));
  if (Number.isFinite(direct)) return direct;
  const fallback = Date.parse(`${session.date || ''}T${session.start_time || '00:00'}:00`);
  return Number.isFinite(fallback) ? fallback : NaN;
}

async function sessionStats(databases, coachIds) {
  const map = new Map(coachIds.map((coachId) => [coachId, {
    sessions_taught: 0,
    activeAthletes: new Set(),
  }]));
  if (coachIds.length === 0) return map;

  const now = Date.now();
  const activeWindowStart = now - 30 * 24 * 60 * 60 * 1000;
  const activeWindowEnd = now + 30 * 24 * 60 * 60 * 1000;
  const activeStatuses = new Set(['pending', 'confirmed', 'completed']);
  const sessions = await listSessionsForCoaches(databases, coachIds);

  for (const session of sessions) {
    const stats = map.get(session.coach_id);
    if (!stats) continue;
    if (session.status === 'completed') stats.sessions_taught += 1;
    if (!activeStatuses.has(session.status)) continue;
    const startsAt = sessionDateMs(session);
    if (!Number.isFinite(startsAt) || startsAt < activeWindowStart || startsAt > activeWindowEnd) continue;
    const athleteKey = session.athlete_id || String(session.client_email || '').toLowerCase();
    if (athleteKey) stats.activeAthletes.add(athleteKey);
  }

  const compact = new Map();
  for (const [coachId, stats] of map.entries()) {
    compact.set(coachId, {
      sessions_taught: stats.sessions_taught,
      active_athletes: stats.activeAthletes.size,
    });
  }
  return compact;
}

async function listCoaches(databases) {
  const out = [];
  let cursor = null;
  while (out.length < 1000) {
    const page = await databases.listDocuments(DB_ID, 'coaches', [
      Query.orderAsc('display_order'),
      Query.limit(100),
      ...(cursor ? [Query.cursorAfter(cursor)] : []),
    ]);
    out.push(...page.documents);
    if (page.documents.length < 100) break;
    cursor = page.documents[page.documents.length - 1].$id;
  }
  return out;
}

// Active org affiliation per coach: organization name/slug/logo only.
async function orgAffiliations(databases, coachIds) {
  if (coachIds.length === 0) return new Map();
  const linkDocs = [];
  for (let i = 0; i < coachIds.length; i += 100) {
    const page = await databases.listDocuments(DB_ID, 'organization_coaches', [
      Query.equal('coach_id', coachIds.slice(i, i + 100)),
      Query.equal('status', 'active'),
      Query.limit(200),
    ]).catch(() => ({ documents: [] }));
    linkDocs.push(...page.documents);
  }
  const links = { documents: linkDocs };
  const orgIds = [...new Set(links.documents.map((link) => link.organization_id))];
  if (orgIds.length === 0) return new Map();
  const orgs = await databases.listDocuments(DB_ID, 'organizations', [
    Query.equal('$id', orgIds.slice(0, 100)),
    Query.equal('status', 'active'),
    Query.limit(100),
  ]).catch(() => ({ documents: [] }));
  const orgById = new Map(orgs.documents.map((org) => [org.$id, {
    id: org.$id,
    name: org.name || '',
    slug: org.slug || '',
    logo_file_id: org.logo_file_id || '',
  }]));
  const byCoach = new Map();
  for (const link of links.documents) {
    const org = orgById.get(link.organization_id);
    if (org && !byCoach.has(link.coach_id)) byCoach.set(link.coach_id, org);
  }
  return byCoach;
}

async function availabilityPresence(databases, coachIds) {
  const available = new Set();
  for (let i = 0; i < coachIds.length; i += 100) {
    const page = await databases.listDocuments(DB_ID, 'availability_blocks', [
      Query.equal('coach_id', coachIds.slice(i, i + 100)),
      Query.equal('active', true),
      Query.limit(500),
    ]).catch(() => ({ documents: [] }));
    for (const row of page.documents) {
      if (row.block_type !== 'blackout') available.add(row.coach_id);
    }
  }
  return available;
}

function perSessionPriceCents(pkg) {
  const sessions = Math.max(1, Number(pkg.sessions) || 1);
  const options = durationOptions(pkg);
  if (options.length) {
    return Math.min(...options.map((option) => Math.round(option.price_cents / sessions)));
  }
  const cents = Number(pkg.price_cents);
  if (!Number.isInteger(cents) || cents <= 0) return null;
  return Math.round(cents / sessions);
}

function parseJsonArray(value) {
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

function durationOptions(pkg) {
  const parsed = parseJsonArray(pkg?.duration_options);
  const rows = parsed.length
    ? parsed
    : [{
        duration_minutes: Number(pkg?.duration_minutes) || 60,
        price_cents: Number(pkg?.price_cents) || 0,
      }];
  const byDuration = new Map();
  for (const row of rows) {
    const duration = Number(row?.duration_minutes);
    const priceCents = Number(row?.price_cents);
    if (!Number.isInteger(duration) || duration < 15 || duration > 480) continue;
    if (!Number.isInteger(priceCents) || priceCents <= 0) continue;
    byDuration.set(duration, { duration_minutes: duration, price_cents: priceCents });
  }
  return [...byDuration.values()];
}

function setLowestHint(hints, coachId, perSession) {
  if (!coachId || !Number.isInteger(perSession) || perSession <= 0) return;
  const current = hints.get(coachId);
  if (current == null || perSession < current) hints.set(coachId, perSession);
}

// Lowest per-session price (cents) across active visible packages the coach can
// actually offer: direct coach packages, active organization packages, then
// platform defaults only when no coach/org package applies.
async function packagePriceHints(databases, coachIds, orgsByCoach) {
  const hints = new Map();
  for (let i = 0; i < coachIds.length; i += 100) {
    const page = await databases.listDocuments(DB_ID, 'pricing_packages', [
      Query.equal('coach_id', coachIds.slice(i, i + 100)),
      Query.equal('is_active', true),
      Query.equal('is_visible', true),
      Query.limit(500),
    ]).catch(() => ({ documents: [] }));
    for (const pkg of page.documents) {
      setLowestHint(hints, pkg.coach_id, perSessionPriceCents(pkg));
    }
  }

  const coachesByOrg = new Map();
  for (const coachId of coachIds) {
    const org = orgsByCoach.get(coachId);
    if (!org?.id) continue;
    if (!coachesByOrg.has(org.id)) coachesByOrg.set(org.id, []);
    coachesByOrg.get(org.id).push(coachId);
  }

  const orgIds = [...coachesByOrg.keys()];
  for (let i = 0; i < orgIds.length; i += 100) {
    const page = await databases.listDocuments(DB_ID, 'pricing_packages', [
      Query.equal('organization_id', orgIds.slice(i, i + 100)),
      Query.equal('is_active', true),
      Query.equal('is_visible', true),
      Query.limit(500),
    ]).catch(() => ({ documents: [] }));
    for (const pkg of page.documents) {
      const eligibleCoachIds = coachesByOrg.get(pkg.organization_id) || [];
      for (const coachId of eligibleCoachIds) {
        if (pkg.coach_id && pkg.coach_id !== coachId) continue;
        setLowestHint(hints, coachId, perSessionPriceCents(pkg));
      }
    }
  }

  const defaults = await databases.listDocuments(DB_ID, 'pricing_packages', [
    Query.equal('coach_id', ''),
    Query.equal('organization_id', ''),
    Query.equal('is_active', true),
    Query.equal('is_visible', true),
    Query.limit(100),
  ]).catch(() => ({ documents: [] }));
  let defaultHint = null;
  for (const pkg of defaults.documents) {
    const perSession = perSessionPriceCents(pkg);
    if (perSession == null) continue;
    if (defaultHint == null || perSession < defaultHint) defaultHint = perSession;
  }
  if (defaultHint != null) {
    for (const coachId of coachIds) {
      if (!hints.has(coachId)) hints.set(coachId, defaultHint);
    }
  }

  return hints;
}

export default async ({ res, error }) => {
  try {
    const databases = db();
    const all = await listCoaches(databases);

    const activePublished = all.filter((doc) => doc.published === true && doc.is_active === true);
    const availability = await availabilityPresence(databases, activePublished.map((doc) => doc.$id));
    const visibleBase = activePublished.filter((doc) => publicMinimumComplete(doc, availability.has(doc.$id)));

    const visibleIds = visibleBase.map((doc) => doc.$id);
    const orgs = await orgAffiliations(databases, visibleIds);
    const priceHints = await packagePriceHints(databases, visibleIds, orgs);
    const stats = await sessionStats(databases, visibleIds);
    const visible = visibleBase.filter((doc) => priceHints.has(doc.$id));
    return res.json({
      coaches: visible.map((doc) => {
        const card = publicCard(doc, orgs.get(doc.$id), stats.get(doc.$id));
        // Package-derived hint wins over the coach's manual hint when present.
        if (priceHints.has(doc.$id)) card.price_hint_cents = priceHints.get(doc.$id);
        return card;
      }),
    });
  } catch (err) {
    error?.(err?.message || String(err));
    return res.json({ error: 'Could not load public coaches.' }, 500);
  }
};
