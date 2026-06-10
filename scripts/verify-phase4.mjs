// Phase 4 — booking integrity (server-side validation, credits, minors, tz).
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const failures = [];
const read = (p) => readFileSync(join(root, p), 'utf8');
const check = (ok, msg) => { if (!ok) failures.push(msg); };
const includes = (path, snippets) => {
  const content = read(path);
  for (const s of snippets) check(content.includes(s), `${path} is missing: ${s}`);
};

for (const file of [
  'functions/booking/src/main.js',
  'functions/getCoachAvailability/src/main.js',
  'src/pages/Book.jsx',
  'src/lib/scheduleET.js',
]) check(existsSync(join(root, file)), `Missing required Phase 4 file: ${file}`);

includes('functions/booking/src/main.js', [
  'is_minor',                 // minors cannot book without a guardian
  'legalPacketComplete',      // legal gate on the credit path
  'guardian_athletes',        // guardian booking authority
  'booking_rules',            // notice/buffer/max-advance enforcement
  'starts_at_utc',
]);

// Public availability is privacy-safe: opaque busy ranges, never session docs.
const avail = read('functions/getCoachAvailability/src/main.js');
check(!avail.includes('client_email'), 'getCoachAvailability must not expose client_email');
check(avail.includes('busy'), 'getCoachAvailability must return busy ranges');

// The booking UI delegates to the server function and shows the policy.
includes('src/pages/Book.jsx', ["'booking'", '24']);
const book = read('src/pages/Book.jsx');
check(!book.includes('sessionRepo.create'), 'Book.jsx must not create sessions directly');

// Timezone-correct rendering helpers exist.
includes('src/lib/scheduleET.js', ['formatInTz', 'zonedStartUtcMs']);

if (failures.length) {
  console.error('Phase 4 verification failed:');
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log('Phase 4 verification passed.');
