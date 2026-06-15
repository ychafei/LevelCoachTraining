import { Client, Databases, ID, Permission, Query, Role, Users } from 'node-appwrite';
import Stripe from 'stripe';

const DB_ID = process.env.APPWRITE_DATABASE_ID || 'lctraining';
const DEFAULT_TIMEZONE = 'America/Detroit';
const STRIPE_API_VERSION = process.env.STRIPE_API_VERSION || '2026-02-25.clover';
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DURATIONS = new Map([
  [60, { hours: 1, discount: 0 }],
  [90, { hours: 1.5, discount: 0.10 }],
  [120, { hours: 2, discount: 0.15 }],
  [150, { hours: 2.5, discount: 0.18 }],
  [180, { hours: 3, discount: 0.20 }],
]);

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

function bpsInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 10000 ? n : null;
}

function centsInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isInteger(n) ? n : fallback;
}

// Admin-set platform fees are capped at 50%.
function feeBpsInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 5000 ? n : null;
}

function validId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9._-]{1,64}$/.test(value);
}

function cleanKey(value, max = 120) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, max);
}

function asCleanArray(value) {
  if (Array.isArray(value)) return value.map((item) => cleanKey(item)).filter(Boolean);
  if (typeof value === 'string' && value.trim()) return value.split(',').map((item) => cleanKey(item)).filter(Boolean);
  return [];
}

function packageAppliesToSelection(pkg, { sportKey }) {
  const packageSports = asCleanArray(pkg?.sport_keys);
  if (packageSports.length && (!sportKey || !packageSports.includes(sportKey))) return false;
  return true;
}

function coachOffersSport(coach, sportKey) {
  if (!sportKey) return true;
  const sports = asCleanArray(coach?.sports);
  return sports.length === 0 || sports.includes(sportKey);
}

function calculateAmountCents(pkg, durationMinutes) {
  const selected = durationOptionFor(pkg, durationMinutes);
  if (selected) return selected.price_cents;

  const priceCents = Number(pkg.price_cents);
  if (Number.isInteger(priceCents) && priceCents > 0) return priceCents;

  const duration = DURATIONS.get(Number(durationMinutes) || 60);
  if (!duration) return null;
  const sessions = Math.max(1, Number(pkg.sessions) || 1);
  const basePrice = Number(pkg.price);
  if (!Number.isFinite(basePrice) || basePrice <= 0) return null;
  const perSessionBase = basePrice / sessions;
  const perSessionPrice = Math.round(perSessionBase * duration.hours * (1 - duration.discount));
  return Math.round(perSessionPrice * sessions * 100);
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
  return [...byDuration.values()].sort((a, b) => a.duration_minutes - b.duration_minutes);
}

function durationOptionFor(pkg, durationMinutes) {
  const options = durationOptions(pkg);
  if (!options.length) return null;
  const requested = Number(durationMinutes) || options[0].duration_minutes;
  return options.find((option) => option.duration_minutes === requested) || null;
}

function packageHasRequestedDuration(pkg, durationMinutes) {
  const options = durationOptions(pkg);
  return options.length === 0 || options.some((option) => option.duration_minutes === Number(durationMinutes));
}

function calculateSessionPriceCents(pkg, durationMinutes) {
  const sessions = Math.max(1, Number(pkg.sessions) || 1);
  const total = calculateAmountCents(pkg, durationMinutes);
  if (!Number.isInteger(total) || total <= 0) return null;
  return Math.max(1, Math.floor(total / sessions));
}

function normalizedSessionType(value) {
  return String(value || '').trim().toLowerCase();
}

async function globalPlatformBps(db) {
  try {
    const rows = await db.listDocuments(DB_ID, 'site_content', [
      Query.equal('key', 'platform_fee_bps'),
      Query.limit(1),
    ]);
    const raw = rows.documents[0]?.value;
    if (raw !== undefined && raw !== null) {
      return feeBpsInt(Number.parseInt(String(raw), 10));
    }
  } catch {
    return null;
  }
  return null;
}

async function resolvePlatformBps(db, coach, org) {
  const fromCoach = feeBpsInt(coach.platform_fee_bps);
  if (fromCoach !== null) return fromCoach;
  if (org) {
    const fromOrg = feeBpsInt(org.platform_fee_bps);
    if (fromOrg !== null) return fromOrg;
  }
  const fromGlobal = await globalPlatformBps(db);
  if (fromGlobal !== null) return fromGlobal;
  const fromEnv = bpsInt(Number.parseInt(process.env.PLATFORM_FEE_BPS || '', 10));
  if (fromEnv !== null) return fromEnv;
  return 1500;
}

async function activeOrgCoachLink(db, organizationId, coachId) {
  if (!organizationId || !coachId) return false;
  const rows = await db.listDocuments(DB_ID, 'organization_coaches', [
    Query.equal('organization_id', organizationId),
    Query.equal('coach_id', coachId),
    Query.equal('status', 'active'),
    Query.limit(1),
  ]).catch(() => ({ documents: [] }));
  return rows.documents.length > 0;
}

async function activeOrganizationForCoach(db, coachId, preferredOrgId = '') {
  if (preferredOrgId && await activeOrgCoachLink(db, preferredOrgId, coachId)) {
    const preferred = await db.getDocument(DB_ID, 'organizations', preferredOrgId).catch(() => null);
    if (preferred && preferred.status === 'active') return preferred;
  }
  const links = await db.listDocuments(DB_ID, 'organization_coaches', [
    Query.equal('coach_id', coachId),
    Query.equal('status', 'active'),
    Query.limit(10),
  ]).catch(() => ({ documents: [] }));
  for (const link of links.documents) {
    const org = await db.getDocument(DB_ID, 'organizations', link.organization_id).catch(() => null);
    if (org && org.status === 'active') return org;
  }
  return null;
}

async function activePayoutRule(db, organizationId, coachId) {
  const rows = await db.listDocuments(DB_ID, 'payout_rules', [
    Query.equal('organization_id', organizationId),
    Query.equal('coach_id', coachId),
    Query.equal('active', true),
    Query.limit(1),
  ]).catch(() => ({ documents: [] }));
  return rows.documents[0] || null;
}

async function readyConnectedAccount(db, ownerType, ownerId) {
  if (!ownerId) return null;
  const rows = await db.listDocuments(DB_ID, 'stripe_connected_accounts', [
    Query.equal('owner_type', ownerType),
    Query.equal('owner_id', ownerId),
    Query.limit(10),
  ]).catch(() => ({ documents: [] }));
  return rows.documents.find((row) => row.charges_enabled && row.payouts_enabled) || null;
}

async function resolvePayoutPlan(db, coach, preferredOrgId = '') {
  const org = await activeOrganizationForCoach(db, coach.$id, preferredOrgId);
  const platformDefault = await resolvePlatformBps(db, coach, org);
  if (org) {
    const rule = await activePayoutRule(db, org.$id, coach.$id);
    if (rule) {
      const coachBps = bpsInt(rule.coach_share_bps);
      const orgBps = bpsInt(rule.org_share_bps);
      const platformBps = bpsInt(rule.platform_share_bps);
      if (coachBps === null || orgBps === null || platformBps === null
        || coachBps + orgBps + platformBps !== 10000) {
        return { error: `invalid payout_rules row ${rule.$id}` };
      }
      return {
        platform_bps: platformBps,
        coach_bps: coachBps,
        org_bps: orgBps,
        organization_id: org.$id,
        payout_rule_id: rule.$id,
      };
    }
    if (org.payout_model === 'split' || org.payout_model === 'split_future') {
      const coachBps = 6000;
      const orgBps = 10000 - platformDefault - coachBps;
      if (orgBps < 0) return { error: `platform fee ${platformDefault}bps leaves no org share` };
      return { platform_bps: platformDefault, coach_bps: coachBps, org_bps: orgBps, organization_id: org.$id, payout_rule_id: '' };
    }
    if (org.payout_model === 'organization') {
      return { platform_bps: platformDefault, coach_bps: 0, org_bps: 10000 - platformDefault, organization_id: org.$id, payout_rule_id: '' };
    }
    return { platform_bps: platformDefault, coach_bps: 10000 - platformDefault, org_bps: 0, organization_id: org.$id, payout_rule_id: '' };
  }
  return { platform_bps: platformDefault, coach_bps: 10000 - platformDefault, org_bps: 0, organization_id: '', payout_rule_id: '' };
}

function originalCreditCoachId(credit) {
  return String(credit?.original_coach_id || credit?.originating_coach_id || credit?.coach_id || '').trim();
}

function payoutPlanSnapshot({
  payoutPlan,
  coach,
  offering,
  priceSnapshotCents,
  coachAccount,
  orgAccount,
  originalCoachId,
}) {
  return {
    release_trigger: 'session_outcome',
    selected_coach_id: coach.$id,
    original_credit_coach_id: originalCoachId || '',
    organization_id: payoutPlan.organization_id || '',
    payout_rule_id: payoutPlan.payout_rule_id || '',
    platform_share_bps: payoutPlan.platform_bps,
    coach_share_bps: payoutPlan.coach_bps,
    org_share_bps: payoutPlan.org_bps,
    offering_id: offering.pkg.$id,
    package_id: offering.pkg.$id,
    package_name: offering.pkg.name || '',
    session_type: offering.session_type || offering.pkg.session_type || '',
    price_snapshot_cents: priceSnapshotCents,
    currency: 'usd',
    coach_connected_account_id: coachAccount?.stripe_account_id || '',
    org_connected_account_id: orgAccount?.stripe_account_id || '',
  };
}

async function packageBookableForCoach(db, pkg, coachId, context = {}) {
  if (!pkg || pkg.is_visible === false || pkg.is_active === false) return false;
  if (!packageAppliesToSelection(pkg, context)) return false;
  const pkgCoachId = typeof pkg.coach_id === 'string' ? pkg.coach_id : '';
  if (pkgCoachId && pkgCoachId !== coachId) return false;
  const pkgOrgId = typeof pkg.organization_id === 'string' ? pkg.organization_id : '';
  if (pkgOrgId) {
    if (!(await activeOrgCoachLink(db, pkgOrgId, coachId))) return false;
    const org = await db.getDocument(DB_ID, 'organizations', pkgOrgId).catch(() => null);
    if (!org || org.status !== 'active') return false;
  }
  return true;
}

async function resolveOffering(db, coach, credit, payload, durationMinutes) {
  const requestedPackageId = String(payload.package_id || payload.packageId || '').trim();
  const requestedSessionType = normalizedSessionType(payload.session_type || payload.sessionType);
  const context = {
    sportKey: cleanKey(payload.sport_key || payload.sport || ''),
  };
  if (requestedPackageId && validId(requestedPackageId)) {
    const pkg = await db.getDocument(DB_ID, 'pricing_packages', requestedPackageId).catch(() => null);
    if (!(await packageBookableForCoach(db, pkg, coach.$id, context))) {
      return { error: 'This package is not available for the selected coach or sport.' };
    }
    const pkgSessionType = normalizedSessionType(pkg.session_type);
    if (requestedSessionType && pkgSessionType && pkgSessionType !== requestedSessionType) {
      return { error: 'This package is not available for the selected session type.' };
    }
    if (!packageHasRequestedDuration(pkg, durationMinutes)) return { error: 'This package is not available for the selected duration.' };
    const amount = calculateSessionPriceCents(pkg, durationMinutes);
    if (Number.isInteger(amount) && amount > 0) {
      return { pkg, amount_cents: amount, organization_id: pkg.organization_id || '', session_type: pkg.session_type || '' };
    }
    return { error: 'A valid server-side price is required for this package.' };
  }
  const candidates = [];
  if (credit?.package_id && validId(credit.package_id) && credit.package_id !== 'admin_grant') candidates.push(credit.package_id);

  for (const packageId of [...new Set(candidates)]) {
    const pkg = await db.getDocument(DB_ID, 'pricing_packages', packageId).catch(() => null);
    if (await packageBookableForCoach(db, pkg, coach.$id, context)) {
      const pkgSessionType = normalizedSessionType(pkg.session_type);
      if (requestedSessionType && pkgSessionType && pkgSessionType !== requestedSessionType) continue;
      if (!packageHasRequestedDuration(pkg, durationMinutes)) continue;
      const amount = calculateSessionPriceCents(pkg, durationMinutes);
      if (Number.isInteger(amount) && amount > 0) {
        return { pkg, amount_cents: amount, organization_id: pkg.organization_id || '', session_type: pkg.session_type || '' };
      }
    }
  }

  const querySets = [
    [Query.equal('coach_id', coach.$id), Query.equal('is_active', true), Query.equal('is_visible', true), Query.limit(25)],
    [Query.equal('coach_id', ''), Query.equal('is_active', true), Query.equal('is_visible', true), Query.limit(25)],
  ];
  for (const queries of querySets) {
    const rows = await db.listDocuments(DB_ID, 'pricing_packages', queries).catch(() => ({ documents: [] }));
    for (const pkg of rows.documents) {
      if (!(await packageBookableForCoach(db, pkg, coach.$id, context))) continue;
      if (!packageHasRequestedDuration(pkg, durationMinutes)) continue;
      const pkgSessionType = normalizedSessionType(pkg.session_type);
      if (requestedSessionType && pkgSessionType && pkgSessionType !== requestedSessionType) continue;
      const amount = calculateSessionPriceCents(pkg, durationMinutes);
      if (Number.isInteger(amount) && amount > 0) {
        return { pkg, amount_cents: amount, organization_id: pkg.organization_id || '', session_type: pkg.session_type || '' };
      }
    }
  }
  return { error: 'Select an active package for this coach before booking.' };
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
  return coach.is_active === true && coach.published === true;
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

async function firstDocument(db, collection, queries) {
  const rows = await db.listDocuments(DB_ID, collection, [...queries, Query.limit(1)]);
  return rows.documents[0] || null;
}

async function createOnceByIdempotency(db, collection, data, permissions = []) {
  if (data.idempotency_key) {
    const existing = await firstDocument(db, collection, [
      Query.equal('idempotency_key', data.idempotency_key),
    ]).catch(() => null);
    if (existing) return existing;
  }
  return createDocumentResilient(db, collection, data, permissions);
}

function creditLedgerAmount(data) {
  if (Number.isInteger(Number(data.amount_cents))) return Number(data.amount_cents);
  return Math.max(
    Math.abs(Number(data.available_delta_cents) || 0),
    Math.abs(Number(data.reserved_delta_cents) || 0),
  );
}

function creditLedgerType(type) {
  return ({
    checkout_grant: 'purchase',
    top_up_grant: 'top_up',
    reservation_hold: 'reserve',
    reservation_release: 'restore',
    reservation_capture: 'release',
    refund_debit: 'refund',
    admin_grant: 'admin_adjustment',
    admin_debit: 'admin_adjustment',
    migration_import: 'admin_adjustment',
    legacy_advance_recovery: 'admin_adjustment',
  })[type] || type;
}

async function writeCreditLedger(db, data, permissions = []) {
  const normalized = {
    ...data,
    credit_id: data.credit_id || data.credit_lot_id || '',
    credit_lot_id: data.credit_lot_id || data.credit_id || '',
    client_profile_id: data.client_profile_id || data.owner_profile_id || '',
    owner_profile_id: data.owner_profile_id || data.client_profile_id || '',
    amount_cents: creditLedgerAmount(data),
    type: creditLedgerType(data.type),
  };
  return createOnceByIdempotency(db, 'credit_ledger_entries', normalized, permissions).catch(() => null);
}

async function writePaymentLedger(db, data, permissions = []) {
  return createOnceByIdempotency(db, 'payment_ledger_entries', data, permissions).catch(() => null);
}

function creditAvailableCents(credit) {
  const remaining = Number(credit.remaining_amount_cents);
  if (Number.isInteger(remaining) && remaining >= 0) return remaining;
  const available = Number(credit.available_amount_cents);
  if (Number.isInteger(available) && available >= 0) return available;
  const total = Number(credit.total_credits) || 0;
  const used = Number(credit.used_credits) || 0;
  const remainingUnits = Math.max(0, total - used);
  const perSession = Number(credit.per_session_base_price_cents);
  if (Number.isInteger(perSession) && perSession > 0) return remainingUnits * perSession;
  const amount = Number(credit.amount_cents) || 0;
  return total > 0 ? Math.floor((amount * remainingUnits) / total) : 0;
}

async function ensureValueCreditFields(db, credit) {
  const hasAvailable = Number.isInteger(Number(credit.available_amount_cents));
  const hasRemaining = Number.isInteger(Number(credit.remaining_amount_cents));
  const hasReserved = Number.isInteger(Number(credit.reserved_amount_cents));
  const hasOriginal = Number.isInteger(Number(credit.original_amount_cents));
  const hasSpent = Number.isInteger(Number(credit.spent_amount_cents));
  const hasRequestedIdentityFields = credit.original_coach_id !== undefined
    && credit.original_organization_id !== undefined
    && credit.transferable !== undefined;
  if (hasAvailable && hasRemaining && hasReserved && hasOriginal && hasSpent && hasRequestedIdentityFields) return credit;

  const available = creditAvailableCents(credit);
  const original = hasOriginal ? Number(credit.original_amount_cents) : (Number(credit.amount_cents) || available);
  const spent = hasSpent ? Number(credit.spent_amount_cents) : Math.max(0, original - available);
  return updateDocumentResilient(db, 'session_credits', credit.$id, {
    owner_profile_id: credit.owner_profile_id || credit.client_profile_id || '',
    owner_account_id: credit.owner_account_id || '',
    currency: credit.currency || 'usd',
    original_amount_cents: original,
    remaining_amount_cents: available,
    available_amount_cents: hasAvailable ? Number(credit.available_amount_cents) : available,
    reserved_amount_cents: Number.isInteger(Number(credit.reserved_amount_cents)) ? Number(credit.reserved_amount_cents) : 0,
    spent_amount_cents: spent,
    refunded_amount_cents: Number.isInteger(Number(credit.refunded_amount_cents)) ? Number(credit.refunded_amount_cents) : 0,
    earned_amount_cents: Number.isInteger(Number(credit.earned_amount_cents)) ? Number(credit.earned_amount_cents) : spent,
    original_coach_id: credit.original_coach_id || credit.originating_coach_id || credit.coach_id || '',
    original_organization_id: credit.original_organization_id || credit.originating_organization_id || '',
    originating_coach_id: credit.originating_coach_id || credit.original_coach_id || credit.coach_id || '',
    originating_organization_id: credit.originating_organization_id || credit.original_organization_id || '',
    source_payment_record_id: credit.source_payment_record_id || '',
    transferable: typeof credit.transferable === 'boolean' ? credit.transferable : true,
    status: credit.status || 'active',
  }).catch(() => credit);
}

async function reserveCreditValue(db, credit, amountCents, reservationKey, ledgerBase, permissions, error) {
  const current = await ensureValueCreditFields(db, credit);
  const available = creditAvailableCents(current);
  if (available < amountCents) {
    return {
      error: 'Additional credit is required before booking this coach.',
      status: 402,
      amount_due_cents: amountCents - available,
      top_up_amount_cents: amountCents - available,
      session_price_cents: amountCents,
      remaining_amount_cents: available,
      available_amount_cents: available,
    };
  }

  const existing = await firstDocument(db, 'credit_reservations', [
    Query.equal('idempotency_key', reservationKey),
  ]).catch(() => null);
  if (existing) return { reservation: existing, duplicate: true };

  let remainingDebited = false;
  let reservedIncremented = false;
  let availableDebited = false;
  let legacyUnitReserved = false;
  try {
    await db.decrementDocumentAttribute(DB_ID, 'session_credits', current.$id, 'remaining_amount_cents', amountCents, 0);
    remainingDebited = true;
    await db.incrementDocumentAttribute(DB_ID, 'session_credits', current.$id, 'reserved_amount_cents', amountCents);
    reservedIncremented = true;
    await db.decrementDocumentAttribute(DB_ID, 'session_credits', current.$id, 'available_amount_cents', amountCents, 0)
      .then(() => { availableDebited = true; })
      .catch(() => {});
    // Legacy UI compatibility: keep "sessions remaining" moving, but the
    // cent balance above is authoritative.
    const total = Number(current.total_credits) || 0;
    if (total > 0) {
      await db.incrementDocumentAttribute(DB_ID, 'session_credits', current.$id, 'used_credits', 1, total)
        .then(() => { legacyUnitReserved = true; })
        .catch(() => {});
    }
  } catch (err) {
    if (reservedIncremented) {
      await db.decrementDocumentAttribute(DB_ID, 'session_credits', current.$id, 'reserved_amount_cents', amountCents, 0).catch(() => {});
    }
    if (remainingDebited) {
      await db.incrementDocumentAttribute(DB_ID, 'session_credits', current.$id, 'remaining_amount_cents', amountCents).catch(() => {});
    }
    if (availableDebited) {
      await db.incrementDocumentAttribute(DB_ID, 'session_credits', current.$id, 'available_amount_cents', amountCents).catch(() => {});
    }
    if (legacyUnitReserved) {
      await restoreLegacyCreditUnit(db, current.$id, error);
    }
    error?.(`Credit reservation failed: ${err?.message || err}`);
    return { error: 'No remaining credit value on this package.', status: 409, session_price_cents: amountCents };
  }

  let reservation;
  try {
    reservation = await createOnceByIdempotency(db, 'credit_reservations', {
      credit_lot_id: current.$id,
      owner_profile_id: ledgerBase.owner_profile_id || '',
      athlete_id: ledgerBase.athlete_id || '',
      coach_id: ledgerBase.coach_id || '',
      organization_id: ledgerBase.organization_id || '',
      offering_id: ledgerBase.offering_id || '',
      reserved_amount_cents: amountCents,
      captured_amount_cents: 0,
      released_amount_cents: 0,
      currency: ledgerBase.currency || 'usd',
      status: 'reserved',
      idempotency_key: reservationKey,
      metadata: JSON.stringify(ledgerBase.metadata || {}),
    }, permissions);
  } catch (err) {
    await db.decrementDocumentAttribute(DB_ID, 'session_credits', current.$id, 'reserved_amount_cents', amountCents, 0).catch(() => {});
    await db.incrementDocumentAttribute(DB_ID, 'session_credits', current.$id, 'available_amount_cents', amountCents).catch(() => {});
    await db.incrementDocumentAttribute(DB_ID, 'session_credits', current.$id, 'remaining_amount_cents', amountCents).catch(() => {});
    await restoreLegacyCreditUnit(db, current.$id, error);
    throw err;
  }

  await writeCreditLedger(db, {
    credit_lot_id: current.$id,
    owner_profile_id: ledgerBase.owner_profile_id || '',
    athlete_id: ledgerBase.athlete_id || '',
    payment_record_id: current.source_payment_record_id || '',
    reservation_id: reservation.$id,
    type: 'reservation_hold',
    available_delta_cents: -amountCents,
    reserved_delta_cents: amountCents,
    currency: ledgerBase.currency || 'usd',
    idempotency_key: `credit_hold_${reservation.$id}`,
    metadata: JSON.stringify(ledgerBase.metadata || {}),
  }, permissions);
  return { reservation };
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

async function restoreLegacyCreditUnit(db, creditId, error) {
  if (!creditId) return;
  try {
    // Atomic bounded decrement: floor at 0 so concurrent restores can never
    // free more credits than were consumed.
    await db.decrementDocumentAttribute(DB_ID, 'session_credits', creditId, 'used_credits', 1, 0);
  } catch (err) {
    error?.(`Credit restore failed: ${err?.message || err}`);
  }
}

async function restoreCreditReservation(db, session, error) {
  if (!session?.credit_reservation_id) {
    await restoreLegacyCreditUnit(db, session?.credit_id, error);
    return;
  }
  const reservation = await db.getDocument(DB_ID, 'credit_reservations', session.credit_reservation_id).catch(() => null);
  if (!reservation || reservation.status !== 'reserved') return;
  const amount = Number(reservation.reserved_amount_cents || 0);
  if (!(amount > 0)) return;

  try {
    await db.decrementDocumentAttribute(DB_ID, 'session_credits', reservation.credit_lot_id, 'reserved_amount_cents', amount, 0);
    await db.incrementDocumentAttribute(DB_ID, 'session_credits', reservation.credit_lot_id, 'available_amount_cents', amount);
    await db.incrementDocumentAttribute(DB_ID, 'session_credits', reservation.credit_lot_id, 'remaining_amount_cents', amount).catch(() => {});
    await restoreLegacyCreditUnit(db, reservation.credit_lot_id, error);
    await updateDocumentResilient(db, 'credit_reservations', reservation.$id, {
      status: 'released',
      released_amount_cents: amount,
    });
    await writeCreditLedger(db, {
      credit_lot_id: reservation.credit_lot_id,
      owner_profile_id: reservation.owner_profile_id || '',
      athlete_id: reservation.athlete_id || '',
      session_id: session.$id,
      reservation_id: reservation.$id,
      type: 'reservation_release',
      available_delta_cents: amount,
      reserved_delta_cents: -amount,
      currency: reservation.currency || 'usd',
      idempotency_key: `credit_release_${reservation.$id}`,
      metadata: JSON.stringify({ session_id: session.$id }),
    });
  } catch (err) {
    error?.(`Credit reservation restore failed: ${err?.message || err}`);
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

function payoutReleaseIdForSession(sessionId) {
  return `release_${String(sessionId || '').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120)}`;
}

function payoutAlreadyReleased(session) {
  return ['released', 'paid'].includes(String(session?.payout_state || ''));
}

function payoutSnapshotForSession(session) {
  const snapshot = parseJson(session.payout_plan_snapshot);
  const platformBps = bpsInt(snapshot.platform_share_bps ?? snapshot.platform_bps);
  const coachBps = bpsInt(snapshot.coach_share_bps ?? snapshot.coach_bps);
  const orgBps = bpsInt(snapshot.org_share_bps ?? snapshot.org_bps);
  if (platformBps === null || coachBps === null || orgBps === null) {
    return { error: 'Session payout snapshot is missing split basis points.' };
  }
  if (platformBps + coachBps + orgBps !== 10000) {
    return { error: 'Session payout snapshot split basis points must equal 10000.' };
  }
  return {
    platform_bps: platformBps,
    coach_bps: coachBps,
    org_bps: orgBps,
    coach_id: String(snapshot.selected_coach_id || session.coach_id || ''),
    organization_id: String(snapshot.organization_id || session.organization_id || ''),
    coach_connected_account_id: String(snapshot.coach_connected_account_id || ''),
    org_connected_account_id: String(snapshot.org_connected_account_id || ''),
    raw: snapshot,
  };
}

async function creditReadPermissions(db, credit, reservation) {
  const accountIds = [];
  if (credit?.owner_account_id) accountIds.push(credit.owner_account_id);
  const ownerProfileId = credit?.owner_profile_id || credit?.client_profile_id || reservation?.owner_profile_id || '';
  if (ownerProfileId) {
    const owner = await db.getDocument(DB_ID, 'profiles', ownerProfileId).catch(() => null);
    if (owner?.account_id) accountIds.push(owner.account_id);
  }
  const guardianAccounts = await guardianAccountsForAthlete(db, credit?.athlete_id || reservation?.athlete_id || '');
  accountIds.push(...guardianAccounts);
  return [...new Set(accountIds.filter(Boolean))].map((id) => Permission.read(Role.user(id)));
}

async function notifyAdminPayoutReleaseFailed(db, session, payoutReleaseId, reason, detail) {
  const masterAdmin = await firstDocument(db, 'profiles', [
    Query.equal('master_admin_locked', true),
  ]).catch(() => null);
  if (!masterAdmin) return;
  const permissions = masterAdmin.account_id
    ? [
      Permission.read(Role.user(masterAdmin.account_id)),
      Permission.update(Role.user(masterAdmin.account_id)),
    ]
    : [];
  await createDocumentResilient(db, 'notifications', {
    recipient_profile_id: masterAdmin.$id,
    recipient_account_id: masterAdmin.account_id || '',
    type: 'payout_release_failed',
    title: 'Payout release needs retry',
    body: cleanText(`Session ${session.$id} could not release payout: ${detail}`, 2000),
    link: `/admin/payments?session_id=${encodeURIComponent(session.$id)}`,
    read: false,
    data: JSON.stringify({
      session_id: session.$id,
      payout_release_id: payoutReleaseId,
      reason,
    }),
    metadata: JSON.stringify({ detail: String(detail || '').slice(0, 1000) }),
  }, permissions).catch(() => {});
}

async function captureReservation(db, session, reservation, credit, amountCents, { payoutReleaseId, reason, permissions = [] }) {
  if (reservation.status !== 'captured') {
    await db.decrementDocumentAttribute(DB_ID, 'session_credits', reservation.credit_lot_id, 'reserved_amount_cents', amountCents, 0);
    await db.incrementDocumentAttribute(DB_ID, 'session_credits', reservation.credit_lot_id, 'spent_amount_cents', amountCents).catch(() => {});
    await db.incrementDocumentAttribute(DB_ID, 'session_credits', reservation.credit_lot_id, 'earned_amount_cents', amountCents);
    await updateDocumentResilient(db, 'credit_reservations', reservation.$id, {
      status: 'captured',
      captured_amount_cents: amountCents,
    });
  }
  await writeCreditLedger(db, {
    credit_lot_id: reservation.credit_lot_id,
    owner_profile_id: reservation.owner_profile_id || '',
    client_profile_id: reservation.owner_profile_id || '',
    athlete_id: reservation.athlete_id || '',
    session_id: session.$id,
    payment_record_id: credit?.source_payment_record_id || '',
    reservation_id: reservation.$id,
    type: 'release',
    amount_cents: amountCents,
    reserved_delta_cents: -amountCents,
    currency: reservation.currency || session.currency || 'usd',
    idempotency_key: `credit_release_${payoutReleaseId}`,
    metadata: JSON.stringify({ session_id: session.$id, payout_release_id: payoutReleaseId, reason }),
  }, permissions);
}

async function releasePayoutLeg(db, stripe, { session, reservation, paymentRecordId, payoutReleaseId, reason, leg, permissions }) {
  const transferIdempotencyKey = `transfer_${payoutReleaseId}_${leg.owner_type}_${leg.owner_id}_${leg.amount_cents}`;
  const obligation = await createOnceByIdempotency(db, 'payout_obligations', {
    session_id: session.$id,
    credit_reservation_id: reservation.$id,
    owner_type: leg.owner_type,
    owner_id: leg.owner_id,
    stripe_connected_account_id: leg.destination,
    gross_session_amount_cents: leg.gross_amount_cents,
    share_bps: leg.share_bps,
    amount_cents: leg.amount_cents,
    currency: leg.currency,
    status: stripe && leg.destination ? 'pending' : 'failed',
    idempotency_key: transferIdempotencyKey,
    metadata: JSON.stringify({ payout_release_id: payoutReleaseId, reason }),
  }, permissions);
  if (obligation.status === 'paid' && obligation.transfer_id) return { status: 'paid', transfer_id: obligation.transfer_id };
  if (!stripe || !leg.destination) {
    await updateDocumentResilient(db, 'payout_obligations', obligation.$id, {
      status: 'failed',
      metadata: JSON.stringify({
        payout_release_id: payoutReleaseId,
        reason,
        error: !stripe ? 'STRIPE_SECRET_KEY is not configured.' : 'Missing snapshot connected account id.',
      }),
    }).catch(() => {});
    return { status: 'failed', error: new Error(!stripe ? 'Stripe is not configured.' : 'Missing payout destination.') };
  }

  await updateDocumentResilient(db, 'payout_obligations', obligation.$id, { status: 'processing' });
  try {
    const transfer = await stripe.transfers.create({
      amount: leg.amount_cents,
      currency: leg.currency,
      destination: leg.destination,
      transfer_group: payoutReleaseId,
      metadata: {
        session_id: session.$id,
        payout_release_id: payoutReleaseId,
        payout_obligation_id: obligation.$id,
        reason,
        owner_type: leg.owner_type,
        owner_id: leg.owner_id,
      },
    }, { idempotencyKey: transferIdempotencyKey });

    const transferRecord = await createOnceByIdempotency(db, 'stripe_transfer_records', {
      payment_record_id: paymentRecordId,
      session_id: session.$id,
      credit_reservation_id: session.credit_reservation_id || '',
      payout_obligation_id: obligation.$id,
      owner_type: leg.owner_type,
      owner_id: leg.owner_id,
      destination_account_id: leg.destination,
      amount: leg.amount_cents,
      amount_cents: leg.amount_cents,
      currency: leg.currency,
      transfer_group: payoutReleaseId,
      idempotency_key: transferIdempotencyKey,
      status: 'paid',
      transfer_id: transfer.id,
    }, permissions);

    await updateDocumentResilient(db, 'payout_obligations', obligation.$id, {
      status: 'paid',
      stripe_transfer_record_id: transferRecord.$id,
      transfer_id: transfer.id,
    });
    await writePaymentLedger(db, {
      payment_record_id: paymentRecordId,
      type: leg.ledger_type,
      amount_cents: leg.amount_cents,
      currency: leg.currency,
      owner_type: leg.owner_type,
      owner_id: leg.owner_id,
      stripe_ref: transfer.id,
      coach_id: session.coach_id || '',
      organization_id: session.organization_id || '',
      session_id: session.$id,
      credit_lot_id: reservation.credit_lot_id,
      credit_reservation_id: session.credit_reservation_id || '',
      idempotency_key: `ledger_${payoutReleaseId}_${leg.ledger_type}`,
      metadata: JSON.stringify({
        payout_release_id: payoutReleaseId,
        reason,
        transfer_record_id: transferRecord.$id,
        share_bps: leg.share_bps,
        destination_account_id: leg.destination,
      }),
    }, permissions);
    return { status: 'paid', transfer_id: transfer.id };
  } catch (err) {
    await updateDocumentResilient(db, 'payout_obligations', obligation.$id, {
      status: 'failed',
      metadata: JSON.stringify({
        payout_release_id: payoutReleaseId,
        reason,
        error: String(err?.message || err).slice(0, 1000),
      }),
    }).catch(() => {});
    return { status: 'failed', error: err };
  }
}

async function releaseSessionPayout(db, sessionId, reason, error) {
  const session = await db.getDocument(DB_ID, 'sessions', sessionId).catch(() => null);
  if (!session) return { payout_state: 'not_payable' };
  if (!session.credit_reservation_id) return { payout_state: session.payout_state || 'not_payable' };
  if (payoutAlreadyReleased(session)) return { payout_state: session.payout_state || 'released' };

  const reservation = await db.getDocument(DB_ID, 'credit_reservations', session.credit_reservation_id).catch(() => null);
  const payoutReleaseId = payoutReleaseIdForSession(session.$id);
  if (!reservation) return { payout_state: 'release_pending_retry' };
  const credit = await db.getDocument(DB_ID, 'session_credits', reservation.credit_lot_id).catch(() => null);
  if (String(credit?.status || 'active') === 'frozen') {
    const detail = 'Credit is frozen, likely due to a payment dispute. Payout release is blocked until the dispute is resolved.';
    await notifyAdminPayoutReleaseFailed(db, session, payoutReleaseId, reason, detail);
    await updateDocumentResilient(db, 'sessions', session.$id, {
      payout_state: 'release_pending_retry',
      payout_release_id: payoutReleaseId,
    }).catch(() => {});
    return { payout_state: 'release_pending_retry', error: detail };
  }
  const amountCents = centsInt(session.reserved_amount_cents, 0)
    || centsInt(session.price_snapshot_cents, 0)
    || centsInt(reservation.reserved_amount_cents, 0);
  if (!(amountCents > 0)) return { payout_state: session.payout_state || 'not_payable' };
  const currency = session.currency || reservation.currency || 'usd';
  const paymentRecordId = credit?.source_payment_record_id || session.credit_id || reservation.credit_lot_id;
  const snapshot = payoutSnapshotForSession(session);
  if (snapshot.error) {
    await notifyAdminPayoutReleaseFailed(db, session, payoutReleaseId, reason, snapshot.error);
    await updateDocumentResilient(db, 'sessions', session.$id, { payout_state: 'release_pending_retry' }).catch(() => {});
    return { payout_state: 'release_pending_retry', error: snapshot.error };
  }
  const creditPermissions = await creditReadPermissions(db, credit, reservation);

  await captureReservation(db, session, reservation, credit, amountCents, {
    payoutReleaseId,
    reason,
    permissions: creditPermissions,
  });

  const coachPayoutCents = Math.floor((amountCents * snapshot.coach_bps) / 10000);
  const orgPayoutCents = Math.floor((amountCents * snapshot.org_bps) / 10000);
  const platformFeeCents = amountCents - coachPayoutCents - orgPayoutCents;
  if (platformFeeCents < 0) {
    const detail = 'Computed payout split exceeds reserved amount.';
    await notifyAdminPayoutReleaseFailed(db, session, payoutReleaseId, reason, detail);
    await updateDocumentResilient(db, 'sessions', session.$id, {
      payment_state: 'released',
      payout_state: 'release_pending_retry',
    }).catch(() => {});
    return { payout_state: 'release_pending_retry', error: detail };
  }

  await writePaymentLedger(db, {
    payment_record_id: paymentRecordId,
    type: 'platform_fee',
    amount_cents: platformFeeCents,
    currency,
    owner_type: 'platform',
    owner_id: '',
    stripe_ref: '',
    coach_id: session.coach_id || '',
    organization_id: session.organization_id || '',
    session_id: session.$id,
    credit_lot_id: reservation.credit_lot_id,
    credit_reservation_id: reservation.$id,
    idempotency_key: `ledger_${payoutReleaseId}_platform_fee`,
    metadata: JSON.stringify({
      payout_release_id: payoutReleaseId,
      reason,
      platform_bps: snapshot.platform_bps,
      reserved_amount_cents: amountCents,
    }),
  });

  const coach = snapshot.coach_id ? await db.getDocument(DB_ID, 'coaches', snapshot.coach_id).catch(() => null) : null;
  const coachPermissions = coach?.user_id ? [Permission.read(Role.user(coach.user_id))] : [];
  const legs = [
    {
      owner_type: 'coach',
      owner_id: snapshot.coach_id,
      amount_cents: coachPayoutCents,
      gross_amount_cents: amountCents,
      share_bps: snapshot.coach_bps,
      destination: snapshot.coach_connected_account_id,
      ledger_type: 'coach_payout',
      currency,
      permissions: coachPermissions,
    },
    {
      owner_type: 'org',
      owner_id: snapshot.organization_id,
      amount_cents: orgPayoutCents,
      gross_amount_cents: amountCents,
      share_bps: snapshot.org_bps,
      destination: snapshot.org_connected_account_id,
      ledger_type: 'org_payout',
      currency,
      permissions: [],
    },
  ].filter((leg) => leg.amount_cents > 0 && leg.owner_id);

  const stripe = process.env.STRIPE_SECRET_KEY
    ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: STRIPE_API_VERSION })
    : null;
  const results = [];
  for (const leg of legs) {
    results.push(await releasePayoutLeg(db, stripe, {
      session,
      reservation,
      paymentRecordId,
      payoutReleaseId,
      reason,
      leg,
      permissions: leg.permissions,
    }));
  }

  const failed = results.find((r) => r.status === 'failed');
  if (failed) {
    const detail = failed.error?.message || failed.error || 'Stripe transfer failed.';
    error?.(`Payout release ${payoutReleaseId} failed: ${detail}`);
    await notifyAdminPayoutReleaseFailed(db, session, payoutReleaseId, reason, detail);
    await updateDocumentResilient(db, 'sessions', session.$id, {
      payment_state: 'released',
      payout_state: 'release_pending_retry',
    }).catch(() => {});
    return { payout_state: 'release_pending_retry', error: detail };
  }
  await updateDocumentResilient(db, 'sessions', session.$id, {
    payment_state: 'released',
    payout_state: 'released',
  }).catch(() => {});
  return { payout_state: 'released', payout_release_id: payoutReleaseId };
}

// --- Actions -------------------------------------------------------------------

async function bookAction(db, users, accountId, profile, payload, res, error) {
  const coachId = String(payload.coach_id || '').trim();
  const creditId = String(payload.credit_id || '').trim();
  const packageId = String(payload.package_id || payload.packageId || '').trim();
  const date = String(payload.date || '').trim();
  const startTime = String(payload.start_time || '').trim();
  const durationMinutes = Number(payload.duration_minutes);
  const athleteId = String(payload.athlete_id || '').trim();
  const notes = cleanText(payload.notes, 20000);
  const preferredLocation = cleanText(payload.preferred_location || payload.preferredLocation || '', 1000);
  const sportKey = cleanKey(payload.sport_key || payload.sport || '');

  if (!coachId || coachId.length > 64) return res.json({ error: 'coach_id is required.' }, 400);
  if (!creditId || creditId.length > 64) return res.json({ error: 'credit_id is required.' }, 400);
  if (packageId && !validId(packageId)) return res.json({ error: 'package_id is invalid.' }, 400);
  if (!validDate(date)) return res.json({ error: 'date must be YYYY-MM-DD.' }, 400);
  if (!validTime(startTime)) return res.json({ error: 'start_time must be HH:MM.' }, 400);
  if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 480) {
    return res.json({ error: 'duration_minutes must be an integer between 15 and 480.' }, 400);
  }

  const coach = await db.getDocument(DB_ID, 'coaches', coachId).catch(() => null);
  if (!coach) return res.json({ error: 'Coach not found.' }, 404);
  if (!coachAccepting(coach)) return res.json({ error: 'This coach is not accepting bookings.' }, 400);
  if (!coachOffersSport(coach, sportKey)) return res.json({ error: 'This coach does not offer the selected sport.' }, 400);

  // Minors never book directly — a linked guardian books for them.
  if (profile.is_minor === true) {
    return res.json({ error: 'A parent or guardian must book sessions for minors.' }, 403);
  }

  const credit = await db.getDocument(DB_ID, 'session_credits', creditId).catch(() => null);
  if (!credit) return res.json({ error: 'Credit not found.' }, 404);
  const creditAthleteId = String(credit.athlete_id || '').trim();
  const effectiveAthleteId = athleteId || creditAthleteId;
  if (athleteId && creditAthleteId && athleteId !== creditAthleteId) {
    return res.json({ error: 'This credit belongs to a different athlete.' }, 403);
  }
  if (String(credit.status || 'active') !== 'active') {
    return res.json({ error: 'This credit is not available for booking.' }, 409);
  }

  // Athlete resolution: self athlete profile, or guardian booking for a child.
  let athlete = null;
  let guardianBooking = false;
  let athleteGuardianLink = null;
  if (effectiveAthleteId) {
    athlete = await db.getDocument(DB_ID, 'athlete_profiles', effectiveAthleteId).catch(() => null);
    if (!athlete) return res.json({ error: 'Athlete not found.' }, 404);
    if (athlete.profile_id === profile.$id) {
      guardianBooking = false;
    } else {
      athleteGuardianLink = await guardianLink(db, profile.$id, athlete.$id);
      if (!athleteGuardianLink) return res.json({ error: 'You are not linked to this athlete.' }, 403);
      if (athleteGuardianLink.can_book === false) return res.json({ error: 'Your guardian permissions do not allow booking.' }, 403);
      guardianBooking = true;
    }
  }

  const ownsCredit = credit.client_profile_id
    ? credit.client_profile_id === profile.$id
    : credit.owner_profile_id
      ? credit.owner_profile_id === profile.$id
    : String(credit.client_email || '').toLowerCase() === String(profile.email || '').toLowerCase();
  const isCreditAthleteSelf = Boolean(creditAthleteId && athlete?.profile_id === profile.$id);
  const isCreditGuardian = Boolean(creditAthleteId && athleteGuardianLink && athleteGuardianLink.can_book !== false);
  if (!ownsCredit && !isCreditAthleteSelf && !isCreditGuardian) {
    return res.json({ error: 'This credit does not belong to you or an athlete linked to you.' }, 403);
  }

  const signerRole = guardianBooking ? 'guardian' : 'athlete';
  if (!(await legalPacketCompleteFor(db, profile, signerRole, athlete?.$id))) {
    return res.json({ error: 'Complete the current required legal packet before booking.' }, 403);
  }

  const slot = await validateSlot(db, coach, { date, startTime, durationMinutes, excludeSessionId: null });
  if (slot.error) return res.json({ error: slot.error }, slot.status || 409);

  const offering = await resolveOffering(db, coach, credit, { ...payload, package_id: packageId }, durationMinutes);
  if (offering.error) return res.json({ error: offering.error }, 400);
  const priceSnapshotCents = offering.amount_cents;
  if (!Number.isInteger(priceSnapshotCents) || priceSnapshotCents <= 0) {
    return res.json({ error: 'A valid server-side session price is required.' }, 400);
  }

  const payoutPlan = await resolvePayoutPlan(db, coach, offering.organization_id || '');
  if (payoutPlan.error) return res.json({ error: 'This coach is not ready for payout routing.' }, 400);
  const coachAccount = payoutPlan.coach_bps > 0 ? await readyConnectedAccount(db, 'coach', coach.$id) : null;
  if (payoutPlan.coach_bps > 0 && !coachAccount) return res.json({ error: 'This coach is not ready for payouts yet.' }, 400);
  const orgAccount = payoutPlan.org_bps > 0 ? await readyConnectedAccount(db, 'org', payoutPlan.organization_id) : null;
  if (payoutPlan.org_bps > 0 && !orgAccount) return res.json({ error: 'This organization is not ready for payouts yet.' }, 400);
  const originalCoachId = originalCreditCoachId(credit);
  const payoutSnapshot = payoutPlanSnapshot({
    payoutPlan,
    coach,
    offering,
    priceSnapshotCents,
    coachAccount,
    orgAccount,
    originalCoachId,
  });

  const reservationKey = [
    'reserve',
    creditId,
    coach.$id,
    athlete?.$id || profile.$id,
    offering.pkg.$id,
    date,
    startTime,
    durationMinutes,
  ].join('_');

  const reservationResult = await reserveCreditValue(db, credit, priceSnapshotCents, reservationKey, {
    owner_profile_id: profile.$id,
    athlete_id: athlete?.$id || '',
    coach_id: coach.$id,
    organization_id: payoutPlan.organization_id || '',
    offering_id: offering.pkg.$id,
    currency: 'usd',
    metadata: {
      price_snapshot_cents: priceSnapshotCents,
      sport_key: sportKey,
      preferred_location: preferredLocation,
      client_message: notes,
      platform_share_bps: payoutPlan.platform_bps,
      coach_share_bps: payoutPlan.coach_bps,
      org_share_bps: payoutPlan.org_bps,
      original_credit_coach_id: originalCoachId,
      payout_plan_snapshot: payoutSnapshot,
    },
  }, [], error);
  if (reservationResult.error) {
    return res.json({
      error: reservationResult.error,
      requires_top_up: reservationResult.status === 402,
      amount_due_cents: reservationResult.amount_due_cents || reservationResult.top_up_amount_cents || 0,
      top_up_amount_cents: reservationResult.top_up_amount_cents || 0,
      session_price_cents: reservationResult.session_price_cents || priceSnapshotCents,
      remaining_amount_cents: reservationResult.remaining_amount_cents || reservationResult.available_amount_cents || 0,
      available_amount_cents: reservationResult.available_amount_cents || 0,
    }, reservationResult.status || 409);
  }
  const reservation = reservationResult.reservation;
  if (reservationResult.duplicate && reservation.session_id) {
    const existingSession = await db.getDocument(DB_ID, 'sessions', reservation.session_id).catch(() => null);
    if (existingSession) return res.json({ session: existingSession, duplicate: true });
  }

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
      total_price: priceSnapshotCents / 100,
      credit_reservation_id: reservation.$id,
      offering_id: offering.pkg.$id,
      sport_key: sportKey,
      preferred_location: preferredLocation,
      reserved_amount_cents: priceSnapshotCents,
      price_snapshot_cents: priceSnapshotCents,
      payout_plan_snapshot: JSON.stringify(payoutSnapshot),
      original_credit_coach_id: originalCoachId,
      currency: 'usd',
      platform_share_bps: payoutPlan.platform_bps,
      coach_share_bps: payoutPlan.coach_bps,
      org_share_bps: payoutPlan.org_bps,
      organization_id: payoutPlan.organization_id || '',
      payout_rule_id: payoutPlan.payout_rule_id || '',
      coach_connected_account_id_snapshot: coachAccount?.stripe_account_id || '',
      org_connected_account_id_snapshot: orgAccount?.stripe_account_id || '',
      payment_state: 'reserved',
      payout_state: 'not_payable',
    }, permissions);
    await updateDocumentResilient(db, 'credit_reservations', reservation.$id, {
      session_id: session.$id,
    });
  } catch (err) {
    await restoreCreditReservation(db, { ...reservation, credit_reservation_id: reservation.$id, credit_id: creditId, $id: '' }, error);
    throw err;
  }

  const when = formatStart(slot.startUtcIso, slot.timezone);
  const coachName = [coach.first_name, coach.last_name].filter(Boolean).join(' ') || 'your coach';
  await notifyBothSides(db, {
    session, coach, profile,
    type: 'booking_confirmed',
    title: 'Session confirmed',
    coachMessage: `${session.client_name} booked a ${durationMinutes}-minute session on ${when}.${preferredLocation ? ` Preferred location: ${preferredLocation}.` : ''}`,
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
  // Coach email is PII held in the server-only coach_private collection.
  const coachPriv = await db.listDocuments(DB_ID, 'coach_private', [
    Query.equal('coach_id', coach.$id), Query.limit(1),
  ]).then((r) => r.documents[0]).catch(() => null);
  const coachNotifyEmail = coachPriv?.email || coach.email;
  if (coachNotifyEmail) await sendEmail({
    to: coachNotifyEmail,
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
  if (restore) await restoreCreditReservation(db, session, error);

  let updated = await updateDocumentResilient(db, 'sessions', session.$id, {
    status: 'cancelled',
    cancellation_reason: reason,
    payment_state: restore ? 'restored' : session.payment_state || 'reserved',
  });
  if (!restore) {
    const payout = await releaseSessionPayout(db, updated.$id, 'late_cancel_forfeiture', error);
    updated = await updateDocumentResilient(db, 'sessions', updated.$id, {
      payment_state: 'released',
      payout_state: payout.payout_state,
    });
  }

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

async function statusAction(db, users, accountId, profile, payload, newStatus, res, error) {
  const sessionId = String(payload.session_id || '').trim();
  if (!sessionId) return res.json({ error: 'session_id is required.' }, 400);

  const session = await db.getDocument(DB_ID, 'sessions', sessionId).catch(() => null);
  if (!session) return res.json({ error: 'Session not found.' }, 404);
  if (session.status !== 'confirmed' && session.status !== newStatus) {
    return res.json({ error: 'Only confirmed sessions can be updated.' }, 400);
  }

  const authority = await sessionAuthority(db, users, accountId, profile, session);
  if (!authority.isCoach && !authority.isAdmin) {
    const account = await users.get(accountId).catch(() => null);
    if (!isAdminLabel(account?.labels)) {
      return res.json({ error: 'Only the coach or an admin can do that.' }, 403);
    }
  }
  if (session.status === newStatus && payoutAlreadyReleased(session)) {
    return res.json({ session, duplicate: true });
  }

  const startMs = sessionStartMs(session, authority.coach);
  if (session.status !== newStatus && newStatus !== 'late_cancelled_chargeable' && startMs !== null && startMs > Date.now() && !authority.isAdmin) {
    return res.json({ error: 'Sessions can only be finalized after their scheduled start time.' }, 400);
  }

  // completed/no_show/late_cancelled_chargeable capture reserved value and
  // release delayed payouts. They never restore the credit.
  const provisional = session.status === newStatus
    ? session
    : await updateDocumentResilient(db, 'sessions', session.$id, {
      status: newStatus,
      outcome_finalized_at: new Date().toISOString(),
    });
  const payout = await releaseSessionPayout(db, provisional.$id, newStatus, error);
  const updated = await updateDocumentResilient(db, 'sessions', provisional.$id, {
    payment_state: 'released',
    payout_state: payout.payout_state,
  });
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
        return await statusAction(db, users, accountId, profile, payload, 'completed', res, error);
      case 'no_show':
        return await statusAction(db, users, accountId, profile, payload, 'no_show', res, error);
      case 'late_cancelled_chargeable':
        return await statusAction(db, users, accountId, profile, payload, 'late_cancelled_chargeable', res, error);
      default:
        return res.json({ error: 'Unknown action.' }, 400);
    }
  } catch (err) {
    error?.(err?.message || String(err));
    return res.json({ error: 'Could not process booking request.' }, 500);
  }
};
