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
//   PAYPAL_CLIENT_ID, PAYPAL_SECRET_KEY, PAYPAL_WEBHOOK_ID
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

if (!ENDPOINT || !PROJECT || !API_KEY) {
  console.error('Missing VITE_APPWRITE_ENDPOINT / VITE_APPWRITE_PROJECT_ID / APPWRITE_API_KEY');
  process.exit(1);
}

const VAR_MATRIX = {
  getPublicCoaches:     ['APPWRITE_API_KEY'],
  getCoachAvailability: ['APPWRITE_API_KEY'],
  getCoachClients:      ['APPWRITE_API_KEY'],
  getMatchingPlayers:   ['APPWRITE_API_KEY'],
  createStripeCheckout: ['APPWRITE_API_KEY', 'APP_BASE_URL', 'STRIPE_SECRET_KEY'],
  stripeWebhook:        ['APPWRITE_API_KEY', 'STRIPE_WEBHOOK_SECRET'],
  createPaypalOrder:    ['APPWRITE_API_KEY', 'PAYPAL_CLIENT_ID', 'PAYPAL_SECRET_KEY'],
  capturePaypalOrder:   ['PAYPAL_CLIENT_ID', 'PAYPAL_SECRET_KEY'],
  paypalWebhook:        ['APPWRITE_API_KEY', 'PAYPAL_CLIENT_ID', 'PAYPAL_SECRET_KEY', 'PAYPAL_WEBHOOK_ID'],
  'send-email':              ['RESEND_API_KEY'],
  sendBookingEmails:         ['RESEND_API_KEY'],
  sendCoachEmailVerification:['RESEND_API_KEY'],
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
