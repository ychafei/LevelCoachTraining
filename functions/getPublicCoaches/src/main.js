// Public marketplace cards. Only published coaches; PII (email/phone/user_id)
// and platform fee fields are never returned.
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

// Explicit allowlist — anything not listed here never leaves the server.
function publicCard(doc, organization) {
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
    organization: organization || null,
  };
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

// Lowest per-session price (cents) across a coach's active packages. This makes
// the "From $X / session" hint on cards reflect the coach's real pricing.
async function packagePriceHints(databases, coachIds) {
  const hints = new Map();
  for (let i = 0; i < coachIds.length; i += 100) {
    const page = await databases.listDocuments(DB_ID, 'pricing_packages', [
      Query.equal('coach_id', coachIds.slice(i, i + 100)),
      Query.equal('is_active', true),
      Query.limit(500),
    ]).catch(() => ({ documents: [] }));
    for (const pkg of page.documents) {
      const cents = Number(pkg.price_cents);
      const sessions = Math.max(1, Number(pkg.sessions) || 1);
      if (!Number.isInteger(cents) || cents <= 0) continue;
      const perSession = Math.round(cents / sessions);
      const current = hints.get(pkg.coach_id);
      if (current == null || perSession < current) hints.set(pkg.coach_id, perSession);
    }
  }
  return hints;
}

export default async ({ res, error }) => {
  try {
    const databases = db();
    const all = await listCoaches(databases);

    // Publish gate: prefer the published flag; until any coach document carries
    // the attribute (pre-cutover data), fall back to is_active.
    const hasPublished = all.some((doc) => typeof doc.published === 'boolean');
    const visible = hasPublished
      ? all.filter((doc) => doc.published === true)
      : all.filter((doc) => doc.is_active === true);

    const visibleIds = visible.map((doc) => doc.$id);
    const orgs = await orgAffiliations(databases, visibleIds);
    const priceHints = await packagePriceHints(databases, visibleIds);
    return res.json({
      coaches: visible.map((doc) => {
        const card = publicCard(doc, orgs.get(doc.$id));
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
