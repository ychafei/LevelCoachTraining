// getPublicCoaches returns sanitized public cards. This helper also sanitizes
// defensively so a raw coach document passed in by mistake cannot leak
// email/phone/user_id, Stripe ids, fee fields, or internal verification notes.
// `availability` may arrive as a JSON string from direct coach reads, so
// normalize here and expose `coach.id` consistently.
import {
  coachDistanceMiles,
  coachServiceRadiusMiles,
  resolvePlace,
} from '@/lib/metroDetroitPlaces';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const SPORT_KEYWORDS = [
  'Soccer',
  'Basketball',
  'Football',
  'Baseball',
  'Volleyball',
  'Tennis',
  'Lacrosse',
  'Hockey',
  'Softball',
  'Golf',
  'Track',
  'Strength',
  'Speed',
  'Goalkeeper',
];

const SERVICE_TYPE_LABELS = {
  facility: 'Coach facility',
  travels: 'Coach travels',
  hybrid: 'Facility or travel',
  online: 'Online training',
};

const PUBLIC_COACH_FIELDS = [
  'id',
  'first_name',
  'last_name',
  'bio',
  'quote',
  'photo_url',
  'intro_video_url',
  'specializations',
  'sports',
  'rating_avg',
  'review_count',
  'price_hint_cents',
  'sessions_taught',
  'active_athletes',
  'last_active_at',
  'county',
  'training_area',
  'service_city',
  'service_state',
  'service_zip',
  'service_radius_miles',
  'service_type',
  'service_venue',
  'service_counties',
  'location_lat',
  'location_lng',
  'timezone',
  'availability',
  'is_head_coach',
  'display_order',
  'organization',
  // Legacy/imported display-only fields that older public cards may include.
  'primary_sport',
  'sport',
  'age_groups',
  'training_formats',
  'service_area_label',
  'location',
  'city',
  'organization_name',
  'org_name',
  'business_name',
  'academy_name',
  'public_verified',
];

const PUBLIC_ORGANIZATION_FIELDS = ['id', 'name', 'slug', 'logo_file_id'];

function pickAllowed(obj, fields) {
  const out = {};
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(obj || {}, field)) out[field] = obj[field];
  }
  return out;
}

function sanitizeOrganization(org) {
  if (!org || typeof org !== 'object') return null;
  return pickAllowed(org, PUBLIC_ORGANIZATION_FIELDS);
}

export function parseAvailability(val) {
  if (val && typeof val === 'object') return val;
  if (typeof val === 'string' && val.trim()) {
    try { return JSON.parse(val); } catch { return {}; }
  }
  return {};
}

export function normalizePublicCoach(doc) {
  if (!doc) return doc;
  const safe = pickAllowed(doc, PUBLIC_COACH_FIELDS);
  return {
    ...safe,
    id: doc.id || doc.$id,
    availability: parseAvailability(safe.availability),
    sports: Array.isArray(safe.sports) ? safe.sports : [],
    organization: sanitizeOrganization(safe.organization),
  };
}

function compact(value) {
  return typeof value === 'string' ? value.trim() : value;
}

function firstValue(obj, keys) {
  for (const key of keys) {
    const value = compact(obj?.[key]);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return '';
}

function toArray(value) {
  if (Array.isArray(value)) return value.map(compact).filter(Boolean);
  if (typeof value === 'string' && value.trim()) {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function money(value) {
  if (value === undefined || value === null || value === '') return '';
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return '';
  return `$${Math.round(numeric)}`;
}

function recentActivity(value, hours = 24) {
  const ms = Date.parse(String(value || ''));
  if (!Number.isFinite(ms)) return false;
  return Date.now() - ms <= hours * 60 * 60 * 1000;
}

function coachTimeParts(coach, date = new Date()) {
  const timezone = compact(coach?.timezone) || undefined;
  if (timezone) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        weekday: 'long',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(date);
      const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
      const hour = Number(byType.hour);
      const minute = Number(byType.minute);
      if (byType.weekday && Number.isFinite(hour) && Number.isFinite(minute)) {
        return { weekday: byType.weekday, minutes: hour * 60 + minute };
      }
    } catch {
      // Fall through to local browser time if a legacy row has a bad timezone.
    }
  }
  return {
    weekday: DAYS[date.getDay()],
    minutes: date.getHours() * 60 + date.getMinutes(),
  };
}

export function coachIntroEmbedUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    if (host === 'youtu.be') {
      const id = parsed.pathname.split('/').filter(Boolean)[0];
      return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` : '';
    }
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      const parts = parsed.pathname.split('/').filter(Boolean);
      const id = parsed.searchParams.get('v')
        || (['embed', 'shorts', 'live'].includes(parts[0]) ? parts[1] : '');
      return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` : '';
    }
    if (host === 'vimeo.com' || host === 'player.vimeo.com') {
      const id = parsed.pathname.split('/').filter(Boolean).pop();
      return id ? `https://player.vimeo.com/video/${encodeURIComponent(id)}` : '';
    }
  } catch {
    return '';
  }
  return '';
}

function packagePerSessionDollars(pkg) {
  const sessions = Number(pkg?.sessions) || 1;
  const cents = Number(pkg?.price_cents);
  if (Number.isInteger(cents) && cents > 0) return (cents / 100) / sessions;
  const dollars = Number(pkg?.price);
  return Number.isFinite(dollars) && dollars > 0 ? dollars / sessions : NaN;
}

function packageSingleSessionDollars(pkg) {
  const sessions = Number(pkg?.sessions) || 1;
  if (sessions !== 1) return NaN;
  return packagePerSessionDollars(pkg);
}

function publicPackageSessionDollars(packages) {
  const pool = Array.isArray(packages) ? packages : [];
  const singleSessionPrices = pool.map(packageSingleSessionDollars).filter(Number.isFinite);
  if (singleSessionPrices.length) return Math.min(...singleSessionPrices);
  const discountedPrices = pool.map(packagePerSessionDollars).filter(Number.isFinite);
  return discountedPrices.length ? Math.min(...discountedPrices) : null;
}

export function formatAvailabilityTime(time) {
  if (!time || !String(time).includes(':')) return time || '';
  const [rawHour, rawMinute] = String(time).split(':').map(Number);
  if (!Number.isFinite(rawHour) || !Number.isFinite(rawMinute)) return time;
  const suffix = rawHour >= 12 ? 'PM' : 'AM';
  const hour = rawHour % 12 || 12;
  return `${hour}:${String(rawMinute).padStart(2, '0')} ${suffix}`;
}

function inferSport(coach, specializations) {
  const explicit = firstValue(coach, ['primary_sport', 'sport']);
  if (explicit) return explicit;
  const sports = toArray(coach?.sports);
  if (sports.length) return sports[0];
  const haystack = [
    ...specializations,
    coach?.bio,
    coach?.quote,
    coach?.training_area,
    coach?.service_city,
    coach?.service_venue,
    ...(toArray(coach?.service_counties)),
  ].filter(Boolean).join(' ').toLowerCase();
  const match = SPORT_KEYWORDS.find((sport) => haystack.includes(sport.toLowerCase()));
  return match || 'Private Coaching';
}

export function getCoachName(coach) {
  return [coach?.first_name, coach?.last_name].filter(Boolean).join(' ').trim() || 'LevelCoach Coach';
}

export function getCoachInitials(coach) {
  const first = coach?.first_name?.[0] || '';
  const last = coach?.last_name?.[0] || '';
  return `${first}${last}`.toUpperCase() || 'LC';
}

export function enabledAvailabilityDays(availability = {}) {
  return DAYS.filter((day) => availability?.[day]?.enabled);
}

export function nextAvailabilityLabel(coach, windowDays = 21) {
  const availability = coach?.availability || {};
  const now = new Date();
  const today = coachTimeParts(coach, now);
  for (let offset = 0; offset <= windowDays; offset += 1) {
    const date = new Date(now.getTime() + offset * 24 * 60 * 60 * 1000);
    const day = offset === 0 ? today.weekday : coachTimeParts(coach, date).weekday;
    const slot = availability?.[day];
    if (!slot?.enabled || !slot.start) continue;
    const start = minutes(slot.start);
    const end = minutes(slot.end);
    if (offset === 0) {
      if (start !== null && end !== null && end <= today.minutes) continue;
      if (start !== null && start <= today.minutes && end !== null && end > today.minutes) {
        return 'Available today';
      }
      if (start !== null && start <= today.minutes) continue;
    }
    const prefix = offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : day;
    return `${prefix} ${formatAvailabilityTime(slot.start)}`;
  }
  return '';
}

export function isCoachAvailableNow(coach) {
  const availability = coach?.availability || {};
  const today = coachTimeParts(coach, new Date());
  const slot = availability?.[today.weekday];
  if (!slot?.enabled || !slot.start || !slot.end) return false;
  const start = minutes(slot.start);
  const end = minutes(slot.end);
  return start !== null && end !== null && start <= today.minutes && end > today.minutes;
}

export function availabilitySummary(coach) {
  const availability = coach?.availability || {};
  const enabledDays = enabledAvailabilityDays(availability);
  if (!enabledDays.length) return 'Availability coming soon';
  const first = availability[enabledDays[0]];
  const dayLabel = enabledDays.length === 1
    ? enabledDays[0]
    : `${enabledDays.slice(0, 3).map((day) => day.slice(0, 3)).join(', ')}${enabledDays.length > 3 ? ` +${enabledDays.length - 3}` : ''}`;
  if (!first?.start || !first?.end) return dayLabel;
  return `${dayLabel} · ${formatAvailabilityTime(first.start)}-${formatAvailabilityTime(first.end)}`;
}

export function coachBookHref(coach, params = {}) {
  if (!coach?.id) return '/book';
  const search = new URLSearchParams({
    coach_id: coach.id,
    ...params,
  });
  return `/book?${search.toString()}`;
}

export function coachProfileHref(coach) {
  return coach?.id ? `/coaches/${encodeURIComponent(coach.id)}` : '/coaches';
}

export function publicCoachDisplay(coach, options = {}) {
  const normalized = normalizePublicCoach(coach);
  const specializations = toArray(normalized?.specializations);
  const ageGroups = toArray(normalized?.age_groups);
  const trainingFormats = toArray(normalized?.training_formats);
  const serviceCounties = toArray(normalized?.service_counties);
  const displayName = getCoachName(normalized);
  const county = compact(normalized?.county) || '';
  const serviceCity = compact(normalized?.service_city) || '';
  const serviceState = compact(normalized?.service_state) || '';
  const cityStateLabel = [serviceCity, serviceState].filter(Boolean).join(', ');
  const trainingArea = firstValue(normalized, ['service_area_label', 'training_area', 'location', 'city']);
  const locationLabel = cityStateLabel || trainingArea || (county ? `${county} County` : 'Location coming soon');
  const serviceRadiusMiles = coachServiceRadiusMiles(normalized);
  const serviceType = compact(normalized?.service_type) || '';
  const organization = normalized?.organization && typeof normalized.organization === 'object'
    ? normalized.organization
    : null;
  const organizationName = compact(organization?.name) || firstValue(normalized, [
    'organization_name',
    'org_name',
    'business_name',
    'academy_name',
  ]);
  const primarySport = inferSport(normalized, specializations);
  // Server-set price hint (integer cents). No client-side fee math. The hint is
  // anchored to the coach's active Single Session package when one exists, so a
  // discounted bundle never makes the public card imply standalone training is
  // cheaper than it is.
  const priceHintCents = Number(normalized?.price_hint_cents);
  // Fallback only over packages this coach can offer (direct coach packages,
  // active org packages, then platform defaults). Never another coach's
  // pricing.
  const visiblePackage = (pkg) => pkg?.is_active !== false && pkg?.is_visible !== false;
  const ownPackages = Array.isArray(options.packages)
    ? options.packages.filter((pkg) => visiblePackage(pkg) && pkg.coach_id === normalized.id)
    : [];
  const orgPackages = Array.isArray(options.packages) && organization?.id
    ? options.packages.filter((pkg) =>
      visiblePackage(pkg)
      && pkg.organization_id === organization.id
      && (!pkg.coach_id || pkg.coach_id === normalized.id))
    : [];
  const defaultPackages = Array.isArray(options.packages)
    ? options.packages.filter((pkg) => visiblePackage(pkg) && !pkg.coach_id && !pkg.organization_id)
    : [];
  const packagePool = ownPackages.length || orgPackages.length ? [...ownPackages, ...orgPackages] : defaultPackages;
  const publicPackagePrice = publicPackageSessionDollars(packagePool);
  const rateLabel = (Number.isFinite(priceHintCents) && priceHintCents > 0 ? `From ${money(priceHintCents / 100)}` : '')
    || (Number.isFinite(publicPackagePrice) ? `From $${Math.round(publicPackagePrice)}` : '');
  // Rating aggregates are server-maintained (reviews function). Never derived client-side.
  const rating = Number(normalized?.rating_avg);
  const reviewCount = Number(normalized?.review_count);
  const distance = options.searchPlace ? coachDistanceMiles(normalized, options.searchPlace) : null;
  const sessionsTaught = Number(normalized?.sessions_taught);
  const activeAthletes = Number(normalized?.active_athletes);
  const safeSessionsTaught = Number.isFinite(sessionsTaught) && sessionsTaught > 0 ? sessionsTaught : 0;
  const safeActiveAthletes = Number.isFinite(activeAthletes) && activeAthletes > 0 ? activeAthletes : 0;
  const showActiveAthletes = safeActiveAthletes >= 2;
  const lastActiveAt = compact(normalized?.last_active_at) || '';
  const recentlyActive = recentActivity(lastActiveAt);
  const availableNow = isCoachAvailableNow(normalized);

  return {
    raw: normalized,
    id: normalized?.id,
    displayName,
    firstName: normalized?.first_name || 'Coach',
    initials: getCoachInitials(normalized),
    photoUrl: normalized?.photo_url || '',
    introVideoUrl: compact(normalized?.intro_video_url) || '',
    organizationName: organizationName || 'Independent coach',
    primarySport,
    locationLabel,
    countyLabel: county ? `${county} County` : '',
    trainingArea,
    serviceCity,
    serviceState,
    serviceZip: compact(normalized?.service_zip) || '',
    serviceVenue: compact(normalized?.service_venue) || '',
    serviceRadiusMiles,
    serviceRadiusLabel: serviceRadiusMiles ? `${serviceRadiusMiles} mi radius` : '',
    serviceType,
    serviceTypeLabel: SERVICE_TYPE_LABELS[serviceType] || '',
    serviceCounties,
    servedAreas: serviceCounties.length ? serviceCounties.map((item) => `${item} County`) : (county ? [`${county} County`] : []),
    specializations,
    ageGroups,
    trainingFormats,
    sports: toArray(normalized?.sports),
    organization,
    headline: compact(normalized?.quote) || `Personal coaching for athletes who want structured, focused training.`,
    bio: compact(normalized?.bio) || '',
    verified: normalized?.public_verified === true,
    contactVerified: normalized?.public_verified === true,
    nextAvailable: nextAvailabilityLabel(normalized),
    availability: availabilitySummary(normalized),
    rateLabel,
    rateHint: rateLabel ? '/ session' : 'Pricing shown at booking',
    ratingLabel: Number.isFinite(rating) && rating > 0
      ? rating.toFixed(1)
      : '',
    reviewLabel: Number.isFinite(reviewCount) && reviewCount > 0
      ? `${reviewCount} review${reviewCount === 1 ? '' : 's'}`
      : 'New profile',
    sessionsTaught: safeSessionsTaught,
    hasSessionStat: safeSessionsTaught > 0,
    sessionsTaughtLabel: safeSessionsTaught > 0
      ? `${safeSessionsTaught.toLocaleString()} session${safeSessionsTaught === 1 ? '' : 's'}`
      : 'New coach',
    activeAthletes: safeActiveAthletes,
    hasActiveAthleteStat: showActiveAthletes,
    activeAthletesLabel: showActiveAthletes
      ? `${safeActiveAthletes.toLocaleString()} active athletes`
      : '',
    lastActiveAt,
    recentlyActive,
    availableNow,
    presenceLabel: recentlyActive ? (availableNow ? 'Available' : 'Active') : 'Not active in 24h',
    distanceMiles: distance,
    profileHref: coachProfileHref(normalized),
    bookIntroHref: coachBookHref(normalized, { intro: '1' }),
  };
}

function looseLocationMatches(haystack, location) {
  const loc = String(location || '').toLowerCase();
  const isDetroitMetro = loc.includes('detroit') || loc.includes('metro');
  const isMetroCounty = ['oakland', 'macomb', 'wayne'].some((county) => haystack.includes(county));
  if (isDetroitMetro && isMetroCounty) return true;
  const looseLocation = loc
    .replace(/\bmi\b/g, '')
    .replace(/\bmichigan\b/g, '')
    .replace(/[,\s]+/g, ' ')
    .trim();
  return !!looseLocation && (haystack.includes(looseLocation) || haystack.includes(loc));
}

function coachMatchesPlace(coach, searchPlace, radius, haystack) {
  const distance = coachDistanceMiles(coach, searchPlace);
  const selectedRadius = Number.isFinite(radius) ? radius : 15;
  const coachRadius = coachServiceRadiusMiles(coach) || 0;
  const serviceType = compact(coach?.service_type);
  const canServeBeyondBase = serviceType === 'travels' || serviceType === 'hybrid';
  const effectiveRadius = canServeBeyondBase
    ? Math.max(selectedRadius, coachRadius)
    : selectedRadius;

  if (distance !== null) return distance <= effectiveRadius;

  const placeTerms = [
    searchPlace?.label,
    ...(searchPlace?.aliases || []),
  ].filter(Boolean);
  return placeTerms.some((term) => looseLocationMatches(haystack, term));
}

function minutes(value) {
  const [hour, minute] = String(value || '').split(':').map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

function hasAvailabilityMatch(coach, filter) {
  if (!filter || filter === 'Any time') return true;
  const availability = coach?.availability || {};
  const enabledDays = enabledAvailabilityDays(availability);
  if (filter === 'This week') return enabledDays.length > 0;
  if (filter === 'Weekends') return enabledDays.some((day) => day === 'Saturday' || day === 'Sunday');
  if (filter === 'Evenings') {
    return enabledDays.some((day) => {
      const slot = availability[day] || {};
      const start = minutes(slot.start);
      const end = minutes(slot.end);
      return (start !== null && start >= 15 * 60) || (end !== null && end >= 18 * 60);
    });
  }
  return true;
}

export function matchesCoachSearch(coach, filters = {}) {
  const searchPlace = filters.place || resolvePlace(filters.location);
  const model = publicCoachDisplay(coach, { searchPlace });
  const haystack = [
    model.displayName,
    model.organizationName,
    model.primarySport,
    model.locationLabel,
    model.countyLabel,
    model.serviceCity,
    model.serviceState,
    model.serviceZip,
    model.serviceVenue,
    model.serviceRadiusLabel,
    model.serviceTypeLabel,
    model.headline,
    model.bio,
    ...model.specializations,
    ...model.ageGroups,
    ...model.trainingFormats,
    ...model.servedAreas,
  ].join(' ').toLowerCase();

  const sport = compact(filters.sport);
  const location = compact(filters.location);
  const radius = Number(filters.radius || 15);
  const availability = compact(filters.availability);

  if (sport && sport !== 'All sports' && !haystack.includes(sport.toLowerCase())) return false;
  if (searchPlace) {
    if (!coachMatchesPlace(coach, searchPlace, Number.isFinite(radius) ? radius : 15, haystack)) return false;
  } else if (location) {
    if (!looseLocationMatches(haystack, location)) return false;
  }
  if (!hasAvailabilityMatch(coach, availability)) return false;
  return true;
}
