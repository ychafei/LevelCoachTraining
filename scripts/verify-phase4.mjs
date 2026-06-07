import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const read = (file) => readFileSync(resolve(root, file), 'utf8');

let failures = 0;

function pass(message) {
  console.log(`ok - ${message}`);
}

function fail(message) {
  failures += 1;
  console.error(`not ok - ${message}`);
}

function includes(file, needles) {
  const text = read(file);
  for (const needle of needles) {
    if (text.includes(needle)) pass(`${file} includes ${needle}`);
    else fail(`${file} is missing ${needle}`);
  }
}

function excludes(file, needles) {
  const text = read(file);
  for (const needle of needles) {
    if (!text.includes(needle)) pass(`${file} excludes ${needle}`);
    else fail(`${file} still contains ${needle}`);
  }
}

includes('src/lib/metroDetroitPlaces.js', [
  'findPlaceSuggestions',
  'distanceMiles',
  'coachWithinRadius',
]);

includes('src/pages/CoachSearch.jsx', [
  'findPlaceSuggestions',
  'Radius',
  'location_lat',
  'PublicCoachCard',
]);
excludes('src/pages/CoachSearch.jsx', [
  'const GOALS',
  'filters.goal',
  'Training goal',
]);

includes('src/components/public/PublicCoachCard.jsx', [
  'bookingParams',
  'distanceMiles',
  'coachBookHref',
  'mi away',
]);

includes('src/pages/Book.jsx', [
  'availabilityMode',
  'availabilityPreference',
  'I am flexible',
  'athleteAvailabilityPreferenceRepo',
  'booking_location_label',
]);
excludes('src/pages/Book.jsx', [
  'GOAL_TAGS',
  'selectedTags',
  'SESSION GOALS',
]);

includes('src/components/StripeCheckout.jsx', [
  'extraPayload',
  'onBeforeCheckout',
]);

includes('functions/createStripeCheckout/src/main.js', [
  'validateBookingLocation',
  'validateAvailabilityPayload',
  'booking_location_status',
  'availability_mode',
]);

includes('scripts/provision-appwrite.mjs', [
  "'location_lat'",
  "'location_lng'",
  "'athlete_availability_preferences'",
]);

if (failures > 0) {
  console.error(`Phase 4 verification failed with ${failures} issue(s).`);
  process.exit(1);
}

console.log('Phase 4 verification passed.');
