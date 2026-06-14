import { Client, Databases, ID, Query } from 'node-appwrite';
import Stripe from 'stripe';

const DB_ID = process.env.APPWRITE_DATABASE_ID || 'lctraining';
const STRIPE_API_VERSION = process.env.STRIPE_API_VERSION || '2026-02-25.clover';
const COACH_NOT_READY = 'Coach is not ready to accept payments yet.';

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
  coach: 'coach',
  organization_admin: 'organization',
};

function databases() {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://nyc.cloud.appwrite.io/v1')
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);
  return new Databases(client);
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

// Banned users may not start checkouts. Active user_bans rows are matched by profile email.
async function callerBanned(db, profile) {
  if (!profile?.email) return false;
  const rows = await db.listDocuments(DB_ID, 'user_bans', [
    Query.equal('banned_email', profile.email),
    Query.equal('is_active', true),
    Query.limit(1),
  ]).catch(() => ({ documents: [] }));
  return rows.documents.length > 0;
}

function signerRoleForProfile(profile) {
  if (profile.role === 'coach') return 'coach';
  if (profile.onboarding_role === 'organization' || profile.primary_organization_id) return 'organization_admin';
  if (profile.onboarding_role === 'parent' || profile.onboarding_role === 'guardian') return 'guardian';
  return 'athlete';
}

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

function matchesEntity(agreement, signerRole, profile) {
  if (signerRole === 'coach' && profile.coach_id && agreement.coach_id !== profile.coach_id) return false;
  if (signerRole === 'organization_admin' && profile.primary_organization_id && agreement.organization_id !== profile.primary_organization_id) return false;
  return true;
}

function agreementMatchesTemplate(agreement, template) {
  if (!agreement || agreement.status !== 'signed') return false;
  if (agreement.template_id === template.$id) return true;
  return agreement.template_key === template.template_key
    && agreement.template_version === template.version
    && (!template.checksum || !agreement.template_checksum || agreement.template_checksum === template.checksum);
}

// Buyer legal gate. For guardian/parent buyers the packet must be complete for
// the SPECIFIC athlete being purchased for (athleteId), mirroring booking's
// legalPacketCompleteFor: a signed guardian agreement must bind to that athlete
// (legacy unbound rows are accepted). Non-guardian (athlete-self) buyers keep
// the original role-scoped behavior; athleteId is ignored for them.
async function legalPacketComplete(db, profile, athleteId) {
  const signerRole = signerRoleForProfile(profile);
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
      matchesEntity(agreement, signerRole, profile)
      && agreementMatchesTemplate(agreement, template)
      // Guardian signings should bind to the athlete; accept legacy unbound rows.
      && (signerRole !== 'guardian' || !athleteId || !agreement.athlete_id || agreement.athlete_id === athleteId)
    )
  );
}

// Coach payout gate: coach-role templates signed by the coach's linked profile.
// No linked profile means the coach is not ready to be paid.
async function coachLegalPacketComplete(db, coach) {
  if (!coach.user_id) return false;
  const profile = await profileForAccount(db, coach.user_id).catch(() => null);
  if (!profile) return false;

  const [templateRows, agreementRows] = await Promise.all([
    db.listDocuments(DB_ID, 'legal_templates', [
      Query.equal('role', 'coach'),
      Query.equal('required', true),
      Query.limit(100),
    ]),
    db.listDocuments(DB_ID, 'legal_agreements', [
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
      (!agreement.coach_id || agreement.coach_id === coach.$id)
      && agreementMatchesTemplate(agreement, template)
    )
  );
}

function calculateAmountCents(pkg, durationMinutes) {
  // Self-contained per-coach package: price_cents is the authoritative total.
  // The legacy global per-hour multiplier no longer applies.
  const priceCents = Number(pkg.price_cents);
  if (Number.isInteger(priceCents) && priceCents > 0) return priceCents;

  // Legacy fallback: global package priced as (per-hour base × duration table).
  const duration = DURATIONS.get(Number(durationMinutes) || 60);
  if (!duration) return null;
  const sessions = Math.max(1, Number(pkg.sessions) || 1);
  const basePrice = Number(pkg.price);
  if (!Number.isFinite(basePrice) || basePrice <= 0) return null;
  const perSessionBase = basePrice / sessions;
  const perSessionPrice = Math.round(perSessionBase * duration.hours * (1 - duration.discount));
  return Math.round(perSessionPrice * sessions * 100);
}

// Is this a self-contained per-coach package (price + duration baked in)?
function isSelfContained(pkg) {
  return Number.isInteger(Number(pkg.price_cents)) && Number(pkg.price_cents) > 0;
}

// True when the coach has an ACTIVE organization_coaches link to this org —
// the gate for purchasing an org-bound package for that coach.
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

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function distanceMiles(a, b) {
  if (!a || !b) return null;
  const lat1 = finiteNumber(a.lat);
  const lng1 = finiteNumber(a.lng);
  const lat2 = finiteNumber(b.lat);
  const lng2 = finiteNumber(b.lng);
  if (lat1 === null || lng1 === null || lat2 === null || lng2 === null) return null;
  const toRad = (deg) => deg * (Math.PI / 180);
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// Coach coordinates only — no gazetteer lookups.
function coachLocationPoint(coach) {
  const lat = finiteNumber(coach.location_lat);
  const lng = finiteNumber(coach.location_lng);
  if (lat !== null && lng !== null) return { lat, lng };
  return null;
}

function truncateMetadata(value, max = 480) {
  const text = String(value || '').trim();
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function validateBookingLocation(coach, payload) {
  const label = truncateMetadata(payload.booking_location_label || payload.location_label || payload.location || '', 120);
  const lat = finiteNumber(payload.booking_location_lat ?? payload.location_lat ?? payload.lat);
  const lng = finiteNumber(payload.booking_location_lng ?? payload.location_lng ?? payload.lng);
  const radius = finiteNumber(payload.booking_location_radius ?? payload.location_radius ?? payload.radius) ?? 15;

  if (radius < 1 || radius > 50) {
    return { error: 'Location radius must be between 1 and 50 miles.' };
  }
  if (!label && lat === null && lng === null) {
    return { status: 'not_provided', label: '', radius };
  }
  if (!label || lat === null || lng === null) {
    return { error: 'A booking location label, latitude, and longitude are required.' };
  }

  const selected = { label, lat, lng };
  const coachPoint = coachLocationPoint(coach);
  if (!coachPoint) {
    return { status: 'coach_location_unverified', label, lat, lng, radius, distance: null };
  }

  const distance = distanceMiles(coachPoint, selected);
  if (distance !== null && distance > radius) {
    return { error: `Selected coach is ${Math.round(distance)} miles away, outside the ${radius}-mile search radius.` };
  }
  return { status: 'verified', label, lat, lng, radius, distance };
}

function parsePreference(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(String(value)); } catch { return {}; }
}

function validTime(value) {
  return /^\d{2}:\d{2}$/.test(String(value || ''));
}

function validateAvailabilityPayload(payload) {
  const mode = payload.availability_mode || 'exact';
  if (!['exact', 'flexible'].includes(mode)) {
    return { error: 'availability_mode must be exact or flexible.' };
  }
  const preference = parsePreference(payload.availability_preference);
  if (mode !== 'flexible') return { mode, preference: {} };

  const preferredDays = Array.isArray(preference.preferredDays) ? preference.preferredDays.filter(Boolean) : [];
  const timeOfDay = Array.isArray(preference.timeOfDay) ? preference.timeOfDay.filter(Boolean) : [];
  const earliestStart = preference.earliestStart || '';
  const latestStart = preference.latestStart || '';
  if (!preference.dateWindow) return { error: 'Flexible availability requires a date window.' };
  if (preferredDays.length === 0) return { error: 'Flexible availability requires at least one preferred day.' };
  if (timeOfDay.length === 0) return { error: 'Flexible availability requires at least one time-of-day preference.' };
  if (!validTime(earliestStart) || !validTime(latestStart) || earliestStart >= latestStart) {
    return { error: 'Flexible availability requires a valid earliest and latest start time.' };
  }

  return {
    mode,
    preference: {
      dateWindow: preference.dateWindow,
      preferredDays,
      timeOfDay,
      earliestStart,
      latestStart,
    },
  };
}

function validId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9._-]{1,64}$/.test(value);
}

export default async ({ req, res, error }) => {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      error?.('[createStripeCheckout] STRIPE_SECRET_KEY is not configured.');
      return res.json({ error: 'Service configuration error.' }, 500);
    }
    // APP_BASE_URL is required in production — no localhost fallback.
    const appBaseUrl = String(process.env.APP_BASE_URL || '').trim().replace(/\/$/, '');
    if (!appBaseUrl) {
      error?.('[createStripeCheckout] APP_BASE_URL is not configured.');
      return res.json({ error: 'Service configuration error.' }, 500);
    }

    const accountId = callerAccountId(req);
    if (!accountId) return res.json({ error: 'Authentication required.' }, 401);

    const payload = body(req);
    const packageId = payload.packageId || payload.package_id;
    const coachId = payload.coachId || payload.coach_id;
    const requestedDuration = Number(payload.sessionDurationMinutes || payload.session_duration_minutes || 60);
    if (!validId(packageId)) return res.json({ error: 'packageId is required.' }, 400);
    if (!validId(coachId)) return res.json({ error: 'coachId is required.' }, 400);
    if (payload.bookingId && !validId(payload.bookingId)) {
      return res.json({ error: 'bookingId is invalid.' }, 400);
    }
    // Guardian buyers purchase for a specific child; the consent gate below is
    // athlete-scoped. Accept athlete_id from the payload and validate its shape.
    const athleteId = payload.athleteId || payload.athlete_id || '';
    if (athleteId && !validId(athleteId)) {
      return res.json({ error: 'athlete_id is invalid.' }, 400);
    }

    const db = databases();
    const profile = await profileForAccount(db, accountId);
    if (!profile) return res.json({ error: 'No profile found for checkout user.' }, 404);
    if (await callerBanned(db, profile)) return res.json({ error: 'Account access is restricted.' }, 403);
    if (!profile.email) return res.json({ error: 'Checkout user must have an email address.' }, 400);
    // Guardian/parent buyers must identify the child they are purchasing for so
    // the legal gate is athlete-scoped (parity with booking). Otherwise a
    // multi-child guardian who only signed for one child could pay then be
    // blocked at scheduling for another.
    const isGuardianBuyer = signerRoleForProfile(profile) === 'guardian';
    if (isGuardianBuyer && !athleteId) {
      return res.json({ error: 'athlete_id is required for guardian checkout.' }, 400);
    }
    if (!(await legalPacketComplete(db, profile, athleteId))) {
      return res.json({ error: 'Complete the current required legal packet before checkout.' }, 403);
    }

    const pkg = await db.getDocument(DB_ID, 'pricing_packages', packageId).catch(() => null);
    const coach = await db.getDocument(DB_ID, 'coaches', coachId).catch(() => null);
    if (!pkg || !coach) return res.json({ error: 'Package or coach not found.' }, 404);
    if (pkg.is_visible === false) return res.json({ error: 'This package is not available for checkout.' }, 400);

    // Package binding: a coach-bound package can only be purchased for that coach.
    // Read defensively — the attribute may not exist yet during rollout.
    const pkgCoachId = typeof pkg.coach_id === 'string' ? pkg.coach_id : '';
    if (pkgCoachId && pkgCoachId !== coach.$id) {
      return res.json({ error: 'This package is not available for this coach.' }, 400);
    }
    // Org-bound package: only bookable for a coach with an ACTIVE link to that
    // org. Read defensively — organization_id may not exist yet during rollout.
    const pkgOrgId = typeof pkg.organization_id === 'string' ? pkg.organization_id : '';
    if (pkgOrgId && !(await activeOrgCoachLink(db, pkgOrgId, coach.$id))) {
      return res.json({ error: 'This package is not available for this coach.' }, 400);
    }
    if (pkg.is_active === false) return res.json({ error: 'This package is not available for checkout.' }, 400);

    // Duration: a self-contained package defines its own session length (server
    // is the source of truth). Legacy global packages still use the duration
    // table the client selected.
    const durationMinutes = isSelfContained(pkg)
      ? (Number.isInteger(Number(pkg.duration_minutes)) && Number(pkg.duration_minutes) >= 15 ? Number(pkg.duration_minutes) : 60)
      : requestedDuration;
    if (!isSelfContained(pkg) && !DURATIONS.has(durationMinutes)) {
      return res.json({ error: 'sessionDurationMinutes is not a supported duration.' }, 400);
    }

    // Publish gate: the public marketplace only allows active, explicitly
    // published coaches. No rollout fallback to is_active.
    if (coach.published !== true || coach.is_active !== true) return res.json({ error: COACH_NOT_READY }, 400);
    if (!(await coachLegalPacketComplete(db, coach))) return res.json({ error: COACH_NOT_READY }, 400);

    const bookingLocation = validateBookingLocation(coach, payload);
    if (bookingLocation.error) return res.json({ error: bookingLocation.error }, 400);
    const availability = validateAvailabilityPayload(payload);
    if (availability.error) return res.json({ error: availability.error }, 400);

    const amount = calculateAmountCents(pkg, durationMinutes);
    if (!amount || amount < 50) return res.json({ error: 'A valid package amount is required.' }, 400);

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: STRIPE_API_VERSION });
    const bookingReference = payload.bookingId || `checkout_${profile.$id}_${Date.now()}`;
    const metadata = {
      client_profile_id: profile.$id,
      client_account_id: accountId,
      client_email: profile.email,
      athlete_id: athleteId || '',
      package_id: pkg.$id,
      package_name: pkg.name || 'Training sessions',
      package_sessions: String(pkg.sessions || 1),
      session_duration_minutes: String(durationMinutes),
      booking_id: bookingReference,
      coach_id: coach.$id,
      coach_name: [coach.first_name, coach.last_name].filter(Boolean).join(' '),
      originating_organization_id: pkgOrgId || '',
      purpose: 'prepaid_credit',
      booking_location_status: bookingLocation.status,
      booking_location_label: bookingLocation.label || '',
      booking_location_lat: bookingLocation.lat !== null && bookingLocation.lat !== undefined ? String(bookingLocation.lat) : '',
      booking_location_lng: bookingLocation.lng !== null && bookingLocation.lng !== undefined ? String(bookingLocation.lng) : '',
      booking_location_radius: String(bookingLocation.radius || ''),
      booking_location_distance_miles: bookingLocation.distance !== null && bookingLocation.distance !== undefined
        ? bookingLocation.distance.toFixed(2)
        : '',
      availability_mode: availability.mode,
      availability_date_window: availability.preference.dateWindow || '',
      availability_preferred_days: (availability.preference.preferredDays || []).join(','),
      availability_time_of_day: (availability.preference.timeOfDay || []).join(','),
      availability_start_window: availability.preference.earliestStart
        ? `${availability.preference.earliestStart}-${availability.preference.latestStart}`
        : '',
      client_notes: truncateMetadata(payload.client_notes || payload.notes || ''),
    };

    // Platform is merchant of record: no Connect destination or fee fields.
    // No coach/org transfer happens at checkout; value is released only after
    // a session is completed, no-showed, or chargeably late-cancelled.
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      // Card only: a delayed-notification method (ACH/SEPA) could mint a credit
      // before funds settle. Pin to immediate-settlement cards.
      payment_method_types: ['card'],
      success_url: `${appBaseUrl}/book?stripe_success=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appBaseUrl}/book?stripe_cancel=1`,
      client_reference_id: bookingReference,
      customer_email: profile.email,
      metadata,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: amount,
          product_data: { name: metadata.package_name },
        },
      }],
      payment_intent_data: { metadata },
      allow_promotion_codes: false,
    });

    await db.createDocument(DB_ID, 'stripe_payment_records', ID.unique(), {
      booking_id: bookingReference,
      checkout_session_id: session.id,
      amount,
      application_fee: 0,
      currency: 'usd',
      transfer_destination: '',
      status: 'created',
      state: 'created',
      purpose: 'prepaid_credit',
      merchant_of_record: 'levelcoach_platform',
      athlete_id: athleteId || '',
      available_for_refund_cents: amount,
      disputed_amount_cents: 0,
      metadata: JSON.stringify(metadata),
    });

    return res.json({ url: session.url, checkout_session_id: session.id });
  } catch (err) {
    error?.(`[createStripeCheckout] ${err?.message || err}`);
    return res.json({ error: 'Could not create Stripe Checkout session.' }, 500);
  }
};
