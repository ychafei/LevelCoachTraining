import { findPlaceSuggestions, METRO_DETROIT_PLACES, resolvePlace } from '@/lib/metroDetroitPlaces';

export const SPORT_OPTIONS = [
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
];

export const RELATIONSHIP_OPTIONS = [
  'Parent',
  'Guardian',
  'Grandparent',
  'Family member',
  'Other authorized adult',
];

export const CITY_OPTIONS = METRO_DETROIT_PLACES.filter((place) => place.type === 'city');

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function compact(value) {
  return String(value || '').trim();
}

function normalizeForCompare(value) {
  return compact(value).toLowerCase();
}

export function validatePersonName(value, label) {
  const trimmed = compact(value);
  if (!trimmed) return `${label} is required.`;
  if (/\d/.test(trimmed)) return `${label} cannot include numbers.`;
  if (!/^[A-Za-z][A-Za-z .'-]*$/.test(trimmed)) {
    return `${label} can only include letters, spaces, apostrophes, periods, or hyphens.`;
  }
  return '';
}

export function phoneDigits(value) {
  return compact(value).replace(/\D/g, '');
}

export function isValidPhone(value) {
  const digits = phoneDigits(value);
  return digits.length === 10 || (digits.length === 11 && digits.startsWith('1'));
}

export function validatePhone(value, label = 'Phone number') {
  if (!compact(value)) return `${label} is required.`;
  if (!isValidPhone(value)) return `${label} must be a valid 10-digit US phone number.`;
  return '';
}

export function normalizePhoneForStorage(value) {
  const digits = phoneDigits(value);
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return compact(value);
}

export function calculateAgeFromDob(dob) {
  if (!dob) return null;
  const birth = new Date(`${dob}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return null;

  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age;
}

export function isFutureDob(dob) {
  if (!dob) return false;
  const birth = new Date(`${dob}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return birth > today;
}

export function validateDob(dob, label = 'Date of birth') {
  if (!dob) return `${label} is required.`;
  if (calculateAgeFromDob(dob) === null) return `Enter a valid ${label.toLowerCase()}.`;
  if (isFutureDob(dob)) return `${label} cannot be in the future.`;
  return '';
}

export function requiresGuardian(dob) {
  if (!dob || isFutureDob(dob)) return false;
  const age = calculateAgeFromDob(dob);
  return age !== null && age < 18;
}

export function normalizeSport(value) {
  const wanted = normalizeForCompare(value);
  return SPORT_OPTIONS.find((sport) => normalizeForCompare(sport) === wanted) || '';
}

export function validateSport(value) {
  if (!compact(value)) return 'Primary sport is required.';
  if (!normalizeSport(value)) return 'Choose a sport from the approved list.';
  return '';
}

export function citySuggestions(query, limit = 8) {
  const trimmed = compact(query);
  if (!trimmed) return CITY_OPTIONS.slice(0, limit);
  return findPlaceSuggestions(trimmed, limit * 2)
    .filter((place) => place.type === 'city')
    .slice(0, limit);
}

export function resolveCityPlace(value) {
  const trimmed = compact(value);
  if (!trimmed) return null;
  const direct = CITY_OPTIONS.find((place) => normalizeForCompare(place.label) === normalizeForCompare(trimmed));
  if (direct) return direct;
  const resolved = resolvePlace(trimmed);
  return resolved?.type === 'city' ? resolved : null;
}

export function validateCity(value, label = 'Preferred training location') {
  if (!compact(value)) return `${label} is required.`;
  if (!resolveCityPlace(value)) return `${label} must be a supported city.`;
  return '';
}

export function validateEmail(value, label = 'Email address') {
  if (!compact(value)) return `${label} is required.`;
  if (!EMAIL_RE.test(compact(value))) return `Enter a valid ${label.toLowerCase()}.`;
  return '';
}
