import { findPlaceSuggestions, METRO_DETROIT_PLACES, resolvePlace } from '@/lib/metroDetroitPlaces';
import { getSport, sportOptions } from '@/lib/sportsCatalog';

// Catalog-driven options (ARCHITECTURE.md §6). Values are sport_key strings;
// labels are display names.
export const SPORT_SELECT_OPTIONS = sportOptions();

export function sportLabelForKey(key) {
  return getSport(key)?.display_name || '';
}

export function sportKeyForLabel(label) {
  const wanted = String(label || '').trim().toLowerCase();
  if (!wanted) return '';
  const match = SPORT_SELECT_OPTIONS.find(
    (option) => option.label.toLowerCase() === wanted || option.value === wanted,
  );
  return match?.value || '';
}

export function positionsForSport(sportKey) {
  return getSport(sportKey)?.positions || [];
}

export function levelsForSport(sportKey) {
  return getSport(sportKey)?.levels || [];
}

export const AVAILABILITY_OPTIONS = [
  'Weekday mornings',
  'Weekday afternoons',
  'Weekday evenings',
  'Weekend mornings',
  'Weekend afternoons',
  'Weekend evenings',
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

export function validateSportKey(value) {
  if (!compact(value)) return 'Primary sport is required.';
  if (!getSport(value)) return 'Choose a sport from the list.';
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

// Location is city/state plus optional free-text detail. Free text is allowed —
// suggestions only add lat/lng when the city resolves to a known place.
export function validateLocation(value, label = 'Training city or area') {
  if (!compact(value)) return `${label} is required.`;
  return '';
}

export function buildLocationLabel(city, detail = '') {
  const cityText = compact(city);
  const detailText = compact(detail);
  return [cityText, detailText].filter(Boolean).join(' — ').slice(0, 500);
}

export function validateEmail(value, label = 'Email address') {
  if (!compact(value)) return `${label} is required.`;
  if (!EMAIL_RE.test(compact(value))) return `Enter a valid ${label.toLowerCase()}.`;
  return '';
}

// ---------------------------------------------------------------------------
// Athlete training profile <-> profiles.bio
//
// profiles has no structured columns for sport/position/level/availability/
// health/emergency-contact data, and athlete_profiles is server-only writable
// (guardian-managed via the `family` function). For self-managed athletes the
// accountProfile.update whitelist only exposes `bio`, so we store a labeled,
// human-readable block (NOT JSON) that we can also parse back for editing.
// The profile document is private (owner + admin read only).
// ---------------------------------------------------------------------------

const BIO_HEADER = '[Athlete training profile]';

function singleLine(value, max = 2000) {
  return compact(value).replace(/\s*\n+\s*/g, ' / ').slice(0, max);
}

export function buildAthleteBio({
  sportKey = '',
  position = '',
  level = '',
  availability = [],
  trainingGoal = '',
  healthNotes = '',
  emergencyName = '',
  emergencyPhone = '',
  emergencyRelationship = '',
} = {}) {
  const sportName = sportLabelForKey(sportKey);
  const emergency = [compact(emergencyName), compact(emergencyPhone), compact(emergencyRelationship)]
    .filter(Boolean)
    .join(' | ');
  const lines = [
    BIO_HEADER,
    sportName ? `Sport: ${sportName} [${sportKey}]` : '',
    compact(position) ? `Position: ${singleLine(position, 200)}` : '',
    compact(level) ? `Level: ${singleLine(level, 200)}` : '',
    availability.length > 0 ? `Availability: ${availability.map((slot) => singleLine(slot, 80)).join('; ')}` : '',
    compact(trainingGoal) ? `Training goal: ${singleLine(trainingGoal)}` : '',
    compact(healthNotes) ? `Health notes (private): ${singleLine(healthNotes, 4000)}` : '',
    emergency ? `Emergency contact: ${emergency}` : '',
  ].filter(Boolean);
  return lines.join('\n').slice(0, 19000);
}

export function parseAthleteBio(bio) {
  const result = {
    sportKey: '',
    position: '',
    level: '',
    availability: [],
    trainingGoal: '',
    healthNotes: '',
    emergencyName: '',
    emergencyPhone: '',
    emergencyRelationship: '',
  };
  const text = String(bio || '');
  if (!text) return result;

  const line = (label) => {
    const match = new RegExp(`^${label}:\\s*(.+)$`, 'mi').exec(text);
    return match ? match[1].trim() : '';
  };

  const sportLine = line('Sport');
  if (sportLine) {
    const keyMatch = /\[([\w-]+)\]\s*$/.exec(sportLine);
    result.sportKey = keyMatch ? keyMatch[1] : sportKeyForLabel(sportLine);
  }
  result.position = line('Position');
  result.level = line('Level');
  const availability = line('Availability');
  if (availability) {
    result.availability = availability.split(';').map((slot) => slot.trim()).filter(Boolean);
  }
  result.trainingGoal = line('Training goal');
  result.healthNotes = line('Health notes \\(private\\)');
  const emergency = line('Emergency contact');
  if (emergency) {
    const [name = '', phone = '', relationship = ''] = emergency.split('|').map((part) => part.trim());
    result.emergencyName = name;
    result.emergencyPhone = phone;
    result.emergencyRelationship = relationship;
  }
  return result;
}
