import { Client, Databases, ID, Query } from 'node-appwrite';
import Stripe from 'stripe';

const DB_ID = process.env.APPWRITE_DATABASE_ID || 'lctraining';
const STRIPE_API_VERSION = process.env.STRIPE_API_VERSION || '2026-02-25.clover';

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

function signerRoleForProfile(profile) {
  if (profile.role === 'coach') return 'coach';
  if (profile.onboarding_role === 'organization' || profile.primary_organization_id) return 'organization_admin';
  if (profile.onboarding_role === 'parent' || profile.onboarding_role === 'guardian') return 'guardian';
  return 'athlete';
}

function activeRequired(template, now = Date.now()) {
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

async function legalPacketComplete(db, profile) {
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
      matchesEntity(agreement, signerRole, profile) && agreementMatchesTemplate(agreement, template)
    )
  );
}

function calculateAmountCents(pkg, durationMinutes) {
  const duration = DURATIONS.get(Number(durationMinutes) || 60);
  if (!duration) return null;
  const sessions = Math.max(1, Number(pkg.sessions) || 1);
  const basePrice = Number(pkg.price);
  if (!Number.isFinite(basePrice) || basePrice <= 0) return null;
  const perSessionBase = basePrice / sessions;
  const perSessionPrice = Math.round(perSessionBase * duration.hours * (1 - duration.discount));
  return Math.round(perSessionPrice * sessions * 100);
}

function applicationFeeCents(amountCents, coach, sessions) {
  const type = coach.platform_fee_type || 'none';
  const value = Number(coach.platform_fee_value) || 0;
  if (type === 'percent') return Math.min(amountCents, Math.max(0, Math.round(amountCents * (value / 100))));
  if (type === 'fixed') return Math.min(amountCents, Math.max(0, Math.round(value * 100 * Math.max(1, sessions || 1))));
  return 0;
}

async function connectedAccountFor(db, ownerType, ownerId) {
  if (!ownerId) return null;
  const rows = await db.listDocuments(DB_ID, 'stripe_connected_accounts', [
    Query.equal('owner_type', ownerType),
    Query.equal('owner_id', ownerId),
    Query.limit(10),
  ]).catch(() => ({ documents: [] }));
  return rows.documents.find((row) => row.charges_enabled && row.payouts_enabled) || rows.documents[0] || null;
}

async function organizationDestinationForCoach(db, coachId) {
  const links = await db.listDocuments(DB_ID, 'organization_coaches', [
    Query.equal('coach_id', coachId),
    Query.equal('status', 'active'),
    Query.limit(20),
  ]).catch(() => ({ documents: [] }));

  for (const link of links.documents) {
    if (link.payout_recipient !== 'org') continue;
    const org = await db.getDocument(DB_ID, 'organizations', link.organization_id).catch(() => null);
    if (!org || org.status !== 'active' || org.payout_model === 'coach') continue;
    const account = await connectedAccountFor(db, 'org', org.$id);
    if (account?.charges_enabled && account?.payouts_enabled) {
      return { account, ownerType: 'org', ownerId: org.$id };
    }
  }
  return null;
}

async function paymentDestination(db, coach) {
  const orgDestination = await organizationDestinationForCoach(db, coach.$id);
  if (orgDestination) return orgDestination;

  const coachAccount = await connectedAccountFor(db, 'coach', coach.$id);
  if (coachAccount?.charges_enabled && coachAccount?.payouts_enabled) {
    return { account: coachAccount, ownerType: 'coach', ownerId: coach.$id };
  }
  return { account: null, ownerType: 'coach', ownerId: coach.$id };
}

const METRO_PLACES = [
  ['Detroit, MI', 42.3314, -83.0458, ['detroit', 'wayne']],
  ['Royal Oak, MI', 42.4895, -83.1446, ['royal oak', 'oakland']],
  ['Rochester Hills, MI', 42.6584, -83.1499, ['rochester hills', 'oakland']],
  ['Rochester, MI', 42.6806, -83.1338, ['rochester', 'oakland']],
  ['Sterling Heights, MI', 42.5803, -83.0302, ['sterling heights', 'macomb']],
  ['Troy, MI', 42.6064, -83.1498, ['troy', 'oakland']],
  ['Novi, MI', 42.4806, -83.4755, ['novi', 'oakland']],
  ['Southfield, MI', 42.4734, -83.2219, ['southfield', 'oakland']],
  ['Farmington Hills, MI', 42.4989, -83.3677, ['farmington hills', 'oakland']],
  ['Dearborn, MI', 42.3223, -83.1763, ['dearborn', 'wayne']],
  ['Warren, MI', 42.5145, -83.0147, ['warren', 'macomb']],
  ['Livonia, MI', 42.3684, -83.3527, ['livonia', 'wayne']],
  ['Birmingham, MI', 42.5467, -83.2113, ['birmingham', 'oakland']],
  ['Macomb, MI', 42.7009, -82.9594, ['macomb', 'macomb township']],
  ['Canton, MI', 42.3086, -83.4822, ['canton', 'wayne']],
  ['Oakland County, MI', 42.6603, -83.3850, ['oakland county', 'oakland']],
  ['Macomb County, MI', 42.6759, -82.7779, ['macomb county', 'macomb']],
  ['Wayne County, MI', 42.2791, -83.3362, ['wayne county', 'wayne']],
  ['Metro Detroit, MI', 42.4650, -83.1000, ['metro detroit', 'detroit metro']],
].map(([label, lat, lng, aliases]) => ({ label, lat, lng, aliases }));

function clean(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\bmichigan\b/g, 'mi')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function resolveKnownPlace(value) {
  const term = clean(value);
  if (!term) return null;
  return METRO_PLACES.find((place) => (
    clean(place.label) === term
    || place.aliases.some((alias) => clean(alias) === term)
  )) || METRO_PLACES.find((place) => (
    clean(place.label).includes(term)
    || place.aliases.some((alias) => clean(alias).includes(term))
  )) || null;
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

function coachLocationPoint(coach) {
  const lat = finiteNumber(coach.location_lat ?? coach.lat ?? coach.latitude);
  const lng = finiteNumber(coach.location_lng ?? coach.lng ?? coach.longitude);
  if (lat !== null && lng !== null) return { label: 'coach coordinates', lat, lng };

  const candidates = [
    coach.training_area,
    coach.city,
    coach.location,
    coach.county ? `${coach.county} County, MI` : '',
  ].filter(Boolean);
  for (const candidate of candidates) {
    const match = resolveKnownPlace(candidate);
    if (match) return match;
  }
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

export default async ({ req, res, error }) => {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.json({ error: 'STRIPE_SECRET_KEY is not configured.' }, 500);
    }

    const accountId = callerAccountId(req);
    if (!accountId) return res.json({ error: 'Authentication required.' }, 401);

    const payload = body(req);
    const packageId = payload.packageId || payload.package_id;
    const coachId = payload.coachId || payload.coach_id;
    const durationMinutes = Number(payload.sessionDurationMinutes || payload.session_duration_minutes || 60);
    if (!packageId) return res.json({ error: 'packageId is required.' }, 400);
    if (!coachId) return res.json({ error: 'coachId is required.' }, 400);

    const db = databases();
    const profile = await profileForAccount(db, accountId);
    if (!profile) return res.json({ error: 'No profile found for checkout user.' }, 404);
    if (!profile.email) return res.json({ error: 'Checkout user must have an email address.' }, 400);
    if (!(await legalPacketComplete(db, profile))) {
      return res.json({ error: 'Complete the current required legal packet before checkout.' }, 403);
    }

    const [pkg, coach] = await Promise.all([
      db.getDocument(DB_ID, 'pricing_packages', packageId),
      db.getDocument(DB_ID, 'coaches', coachId),
    ]);
    if (pkg.is_visible === false) return res.json({ error: 'This package is not available for checkout.' }, 400);
    if (coach.is_active === false) return res.json({ error: 'This coach is not accepting bookings.' }, 400);

    const bookingLocation = validateBookingLocation(coach, payload);
    if (bookingLocation.error) return res.json({ error: bookingLocation.error }, 400);
    const availability = validateAvailabilityPayload(payload);
    if (availability.error) return res.json({ error: availability.error }, 400);

    const amount = calculateAmountCents(pkg, durationMinutes);
    if (!amount || amount < 50) return res.json({ error: 'A valid package amount is required.' }, 400);

    const destination = await paymentDestination(db, coach);
    const fee = destination.account
      ? applicationFeeCents(amount, coach, Number(pkg.sessions) || 1)
      : 0;

    const appBaseUrl = (process.env.APP_BASE_URL || 'http://localhost:5173').replace(/\/$/, '');
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: STRIPE_API_VERSION });
    const bookingReference = payload.bookingId || `checkout_${profile.$id}_${Date.now()}`;
    const metadata = {
      client_profile_id: profile.$id,
      client_account_id: accountId,
      client_email: profile.email,
      package_id: pkg.$id,
      package_name: pkg.name || 'Training sessions',
      package_sessions: String(pkg.sessions || 1),
      session_duration_minutes: String(durationMinutes),
      booking_id: bookingReference,
      coach_id: coach.$id,
      coach_name: [coach.first_name, coach.last_name].filter(Boolean).join(' '),
      payee_owner_type: destination.ownerType,
      payee_owner_id: destination.ownerId,
      connected_account_status: destination.account ? 'ready' : 'missing',
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

    const paymentIntentData = {
      metadata,
      ...(destination.account ? {
        transfer_data: { destination: destination.account.stripe_account_id },
        ...(fee > 0 ? { application_fee_amount: fee } : {}),
      } : {}),
    };

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
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
      payment_intent_data: paymentIntentData,
      allow_promotion_codes: false,
    });

    await db.createDocument(DB_ID, 'stripe_payment_records', ID.unique(), {
      booking_id: bookingReference,
      checkout_session_id: session.id,
      amount,
      application_fee: fee,
      currency: 'usd',
      transfer_destination: destination.account?.stripe_account_id || '',
      status: 'created',
      metadata: JSON.stringify(metadata),
    });

    return res.json({ url: session.url, checkout_session_id: session.id });
  } catch (err) {
    error?.(err?.message || String(err));
    return res.json({ error: 'Could not create Stripe Checkout session.', stripe_error: err?.message || String(err) }, 500);
  }
};
