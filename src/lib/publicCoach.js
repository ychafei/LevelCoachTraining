// getPublicCoaches returns sanitized public cards: no email/phone/user_id/fee
// fields ever reach the client. Cards include rating_avg, review_count, sports,
// price_hint_cents and organization {id,name,slug,logo_file_id}. `availability`
// may arrive as a JSON string from direct coach reads, so normalise here and
// expose `coach.id` consistently.
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

export function parseAvailability(val) {
  if (val && typeof val === 'object') return val;
  if (typeof val === 'string' && val.trim()) {
    try { return JSON.parse(val); } catch { return {}; }
  }
  return {};
}

export function normalizePublicCoach(doc) {
  if (!doc) return doc;
  return {
    ...doc,
    id: doc.id || doc.$id,
    availability: parseAvailability(doc.availability),
    sports: Array.isArray(doc.sports) ? doc.sports : [],
    organization: doc.organization && typeof doc.organization === 'object' ? doc.organization : null,
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
  for (let offset = 0; offset <= windowDays; offset += 1) {
    const date = new Date(now);
    date.setDate(now.getDate() + offset);
    const day = DAYS[date.getDay()];
    const slot = availability?.[day];
    if (!slot?.enabled || !slot.start) continue;
    const prefix = offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : day;
    return `${prefix} ${formatAvailabilityTime(slot.start)}`;
  }
  return '';
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
  // Server-set price hint (integer cents). No client-side fee math. The hint
  // is the MINIMUM per-session price across the coach's active packages
  // (getPublicCoaches), so the label always carries a "From" qualifier.
  const priceHintCents = Number(normalized?.price_hint_cents);
  // Fallback only over THIS coach's packages (callers often pass the
  // platform-wide visible list), else platform-default templates (no
  // coach_id) — mirroring what Book.jsx actually offers. Never another
  // coach's pricing.
  const ownPackages = Array.isArray(options.packages)
    ? options.packages.filter((pkg) => pkg.coach_id === normalized.id)
    : [];
  const defaultPackages = Array.isArray(options.packages)
    ? options.packages.filter((pkg) => !pkg.coach_id)
    : [];
  const packagePool = ownPackages.length ? ownPackages : defaultPackages;
  const minPackagePrice = packagePool.length
    ? Math.min(...packagePool.map((pkg) => Number(pkg.price) / (Number(pkg.sessions) || 1)).filter(Number.isFinite))
    : null;
  const rateLabel = (Number.isFinite(priceHintCents) && priceHintCents > 0 ? `From ${money(priceHintCents / 100)}` : '')
    || (Number.isFinite(minPackagePrice) ? `From $${Math.round(minPackagePrice)}` : '');
  // Rating aggregates are server-maintained (reviews function). Never derived client-side.
  const rating = Number(normalized?.rating_avg);
  const reviewCount = Number(normalized?.review_count);
  const distance = options.searchPlace ? coachDistanceMiles(normalized, options.searchPlace) : null;

  return {
    raw: normalized,
    id: normalized?.id,
    displayName,
    firstName: normalized?.first_name || 'Coach',
    initials: getCoachInitials(normalized),
    photoUrl: normalized?.photo_url || '',
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
    // Server-set signal only: coachSelf confirmEmailCode sets email_verified_at.
    // `published` is NOT a verification signal — every visible coach is published,
    // so treating it as one would make the badge meaningless. Label this as
    // "Email verified", never bare "Verified".
    verified: !!normalized?.email_verified_at,
    contactVerified: !!normalized?.email_verified_at,
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
