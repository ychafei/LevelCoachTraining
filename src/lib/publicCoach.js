// getPublicCoaches returns raw Appwrite documents: `availability` is a JSON
// string and the doc id is `$id` (not `id`). Normalise here so the UI can use
// `coach.id` and `coach.availability['Monday']` like everywhere else.
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
    county: coach.county || '',
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
  const displayName = getCoachName(normalized);
  const county = compact(normalized?.county) || '';
  const trainingArea = firstValue(normalized, ['training_area', 'location', 'city']);
  const locationLabel = trainingArea || (county ? `${county} County` : 'Location coming soon');
  const organizationName = firstValue(normalized, [
    'organization_name',
    'org_name',
    'organization',
    'business_name',
    'academy_name',
  ]);
  const primarySport = inferSport(normalized, specializations);
  const sessionRate = firstValue(normalized, [
    'intro_price',
    'session_rate',
    'hourly_rate',
    'price',
    'base_price',
  ]);
  const minPackagePrice = Array.isArray(options.packages) && options.packages.length
    ? Math.min(...options.packages.map((pkg) => Number(pkg.price) / (Number(pkg.sessions) || 1)).filter(Number.isFinite))
    : null;
  const rateLabel = money(sessionRate) || (Number.isFinite(minPackagePrice) ? `From $${Math.round(minPackagePrice)}` : '');
  const rating = Number(normalized?.rating_avg || normalized?.rating);
  const reviewCount = Number(normalized?.review_count || normalized?.reviews);

  return {
    raw: normalized,
    id: normalized?.id,
    displayName,
    firstName: normalized?.first_name || 'Coach',
    initials: getCoachInitials(normalized),
    photoUrl: normalized?.photo_url || '',
    organizationName: organizationName || 'LevelCoach verified coach',
    primarySport,
    locationLabel,
    countyLabel: county ? `${county} County` : '',
    trainingArea,
    specializations,
    ageGroups,
    trainingFormats,
    headline: compact(normalized?.quote) || `Personal coaching for athletes who want structured, focused training.`,
    bio: compact(normalized?.bio) || '',
    verified: !!(normalized?.is_active || normalized?.email_verified_at),
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
    profileHref: coachProfileHref(normalized),
    bookIntroHref: coachBookHref(normalized, { intro: '1' }),
  };
}

export function matchesCoachSearch(coach, filters = {}) {
  const model = publicCoachDisplay(coach);
  const haystack = [
    model.displayName,
    model.organizationName,
    model.primarySport,
    model.locationLabel,
    model.countyLabel,
    model.headline,
    model.bio,
    ...model.specializations,
    ...model.ageGroups,
    ...model.trainingFormats,
  ].join(' ').toLowerCase();

  const sport = compact(filters.sport);
  const location = compact(filters.location);
  const goal = compact(filters.goal);

  if (sport && sport !== 'All sports' && !haystack.includes(sport.toLowerCase())) return false;
  if (location) {
    const loc = location.toLowerCase();
    const isDetroitMetro = loc.includes('detroit') || loc.includes('metro');
    const isMetroCounty = ['oakland', 'macomb', 'wayne'].some((county) => haystack.includes(county));
    if (!(isDetroitMetro && isMetroCounty)) {
      const looseLocation = loc
        .replace(/\bmi\b/g, '')
        .replace(/\bmichigan\b/g, '')
        .replace(/[,\s]+/g, ' ')
        .trim();
      if (looseLocation && !haystack.includes(looseLocation) && !haystack.includes(loc)) return false;
    }
  }
  if (goal && goal !== 'Any goal' && !haystack.includes(goal.toLowerCase())) return false;
  return true;
}
