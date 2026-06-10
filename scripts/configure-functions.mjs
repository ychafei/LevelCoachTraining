// scripts/configure-functions.mjs
//
// Sets the correct environment variables on each Appwrite Function based on
// what each function's source code actually reads. Idempotent — re-running
// updates existing variables in place (update when present, create when not),
// so a partial failure never leaves a function without a previously-set secret.
//
// After this completes, deploy the function code with:
//   node scripts/deploy-functions.mjs
//
// Required env (in .env.local):
//   VITE_APPWRITE_ENDPOINT, VITE_APPWRITE_PROJECT_ID, APPWRITE_API_KEY
//   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_CONNECT_WEBHOOK_SECRET
//   RESEND_API_KEY, APP_BASE_URL, MASTER_ADMIN_EMAIL, UNSUBSCRIBE_SECRET
// Optional:
//   PLATFORM_FEE_BPS (default 1500), EMAIL_FROM

import { Client, Functions } from 'node-appwrite';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env.local');
try {
  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const k = trimmed.slice(0, eq).trim();
    let v = trimmed.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
} catch {
  console.error(`Could not read ${envPath}`);
  process.exit(1);
}

const ENDPOINT = process.env.VITE_APPWRITE_ENDPOINT;
const PROJECT  = process.env.VITE_APPWRITE_PROJECT_ID;
const API_KEY  = process.env.APPWRITE_API_KEY;

const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || process.env.VITE_APPWRITE_DATABASE_ID;

if (!ENDPOINT || !PROJECT || !API_KEY || !DATABASE_ID) {
  console.error('Missing VITE_APPWRITE_ENDPOINT / VITE_APPWRITE_PROJECT_ID / APPWRITE_API_KEY / APPWRITE_DATABASE_ID');
  process.exit(1);
}
process.env.APPWRITE_DATABASE_ID = DATABASE_ID;

const DB_KEYS = ['APPWRITE_API_KEY', 'APPWRITE_DATABASE_ID'];
const EMAIL_KEYS = ['RESEND_API_KEY', 'EMAIL_FROM'];

// Optional keys are configured when present in .env.local and skipped quietly
// when not (everything else logs an error when missing).
const OPTIONAL_KEYS = new Set(['PLATFORM_FEE_BPS', 'EMAIL_FROM']);

const VAR_MATRIX = {
  // Public reads
  getPublicCoaches:     DB_KEYS,
  getCoachAvailability: DB_KEYS,
  getMatchingPlayers:   DB_KEYS,

  // Payments
  createStripeCheckout: [...DB_KEYS, 'APP_BASE_URL', 'STRIPE_SECRET_KEY', 'PLATFORM_FEE_BPS'],
  stripeWebhook:        [...DB_KEYS, 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
  stripeConnectWebhook: [...DB_KEYS, 'STRIPE_SECRET_KEY', 'STRIPE_CONNECT_WEBHOOK_SECRET'],
  stripeConnect:        [...DB_KEYS, 'APP_BASE_URL', 'STRIPE_SECRET_KEY'],
  refundStripePayment:  [...DB_KEYS, 'STRIPE_SECRET_KEY'],

  // Identity / roles
  accountProfile:       DB_KEYS,
  bootstrapMasterAdmin: [...DB_KEYS, 'MASTER_ADMIN_EMAIL'],
  grantAdminRole:       DB_KEYS,

  // Product
  booking:              [...DB_KEYS, ...EMAIL_KEYS, 'APP_BASE_URL'],
  messaging:            DB_KEYS,
  training:             DB_KEYS,
  family:               DB_KEYS,
  coachSelf:            [...DB_KEYS, ...EMAIL_KEYS],
  orgAdmin:             [...DB_KEYS, ...EMAIL_KEYS, 'PLATFORM_FEE_BPS', 'APP_BASE_URL'],
  applications:         [...DB_KEYS, ...EMAIL_KEYS, 'APP_BASE_URL'],
  adminOps:             [...DB_KEYS, ...EMAIL_KEYS, 'APP_BASE_URL'],
  reviews:              DB_KEYS,
  reports:              DB_KEYS,
  emailDispatch:        [...DB_KEYS, 'UNSUBSCRIBE_SECRET'],

  // Legal
  signLegalAgreement:        [...DB_KEYS, 'APP_BASE_URL'],
  generateLegalAgreementPdf: [...DB_KEYS, 'APP_BASE_URL'],
};

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(API_KEY);
const fns = new Functions(client);

console.log(`Configuring function variables on project ${PROJECT}\n`);

let failures = 0;
for (const [fnId, keys] of Object.entries(VAR_MATRIX)) {
  console.log(`[${fnId}]`);
  let existing;
  try {
    existing = await fns.listVariables(fnId);
  } catch (err) {
    console.error(`  ✗ Could not read function (does it exist?): ${err?.message || err}`);
    failures += 1;
    continue;
  }

  for (const key of keys) {
    const value = process.env[key];
    if (!value) {
      if (OPTIONAL_KEYS.has(key)) {
        console.log(`  - ${key} not set (optional, skipped)`);
      } else {
        console.error(`  ✗ ${key} not set in .env.local — skipping`);
        failures += 1;
      }
      continue;
    }
    const prior = existing.variables.find((v) => v.key === key);
    try {
      // Update-in-place: never delete first, so a failed call can't strand a
      // function without a previously-working secret.
      if (prior) {
        await fns.updateVariable(fnId, prior.$id, key, value);
      } else {
        await fns.createVariable(fnId, key, value);
      }
      console.log(`  ${prior ? '↻' : '+'} ${key}`);
    } catch (err) {
      console.error(`  ✗ ${key}: ${err?.message || err}`);
      failures += 1;
    }
  }
}

console.log('\nDone. Now deploy code:');
console.log('  node scripts/deploy-functions.mjs');
if (failures > 0) {
  console.error(`\n${failures} variable(s) could not be configured — review the log above.`);
  process.exitCode = 1;
}
