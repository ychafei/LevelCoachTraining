// scripts/configure-functions.mjs
//
// Sets the correct environment variables on each Appwrite Function based on
// what each function's source code actually reads. Idempotent — re-running
// replaces existing variables in place (delete + create).
//
// After this completes, deploy the function code with:
//   appwrite push functions --all
//
// Required env (in .env.local):
//   VITE_APPWRITE_ENDPOINT, VITE_APPWRITE_PROJECT_ID, APPWRITE_API_KEY
//   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
//   RESEND_API_KEY, APP_BASE_URL

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

const VAR_MATRIX = {
  getPublicCoaches:     DB_KEYS,
  getCoachAvailability: DB_KEYS,
  getCoachClients:      DB_KEYS,
  getMatchingPlayers:   DB_KEYS,
  createStripeCheckout: [...DB_KEYS, 'APP_BASE_URL', 'STRIPE_SECRET_KEY'],
  stripeWebhook:        [...DB_KEYS, 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
  createStripeConnectAccount: [...DB_KEYS, 'STRIPE_SECRET_KEY'],
  createStripeConnectOnboarding: [...DB_KEYS, 'APP_BASE_URL', 'STRIPE_SECRET_KEY'],
  refreshStripeConnectAccount: [...DB_KEYS, 'STRIPE_SECRET_KEY'],
  refundStripePayment: [...DB_KEYS, 'STRIPE_SECRET_KEY'],
  bootstrapMasterAdmin: DB_KEYS,
  grantAdminRole:       DB_KEYS,
  signLegalAgreement:   [...DB_KEYS, 'APP_BASE_URL'],
  generateLegalAgreementPdf: [...DB_KEYS, 'APP_BASE_URL'],
  'send-email':              ['RESEND_API_KEY'],
  sendBookingEmails:         ['RESEND_API_KEY'],
  sendCoachEmailVerification:['RESEND_API_KEY'],
  sendCoachLinkEmail:        ['RESEND_API_KEY'],
};

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(API_KEY);
const fns = new Functions(client);

console.log(`Configuring function variables on project ${PROJECT}\n`);

for (const [fnId, keys] of Object.entries(VAR_MATRIX)) {
  console.log(`[${fnId}]`);
  let existing;
  try {
    existing = await fns.listVariables(fnId);
  } catch (err) {
    console.error(`  ✗ Could not read function (does it exist?): ${err?.message || err}`);
    continue;
  }

  for (const key of keys) {
    const value = process.env[key];
    if (!value) {
      console.error(`  ✗ ${key} not set in .env.local — skipping`);
      continue;
    }
    const prior = existing.variables.find((v) => v.key === key);
    try {
      if (prior) {
        await fns.deleteVariable(fnId, prior.$id);
      }
      await fns.createVariable(fnId, key, value);
      console.log(`  ${prior ? '↻' : '+'} ${key}`);
    } catch (err) {
      console.error(`  ✗ ${key}: ${err?.message || err}`);
    }
  }
}

console.log('\nDone. Now deploy code:');
console.log('  appwrite push functions --all');
