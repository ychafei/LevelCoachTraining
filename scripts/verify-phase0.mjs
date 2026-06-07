import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const appwrite = JSON.parse(readFileSync(join(root, 'appwrite.json'), 'utf8'));
const clientSource = readFileSync(join(root, 'src/api/appwriteClient.js'), 'utf8');
const provisionSource = readFileSync(join(root, 'scripts/provision-appwrite.mjs'), 'utf8');

const expectedFunctions = [
  'getPublicCoaches',
  'getCoachAvailability',
  'getCoachClients',
  'getMatchingPlayers',
  'createStripeCheckout',
  'stripeWebhook',
  'createStripeConnectAccount',
  'createStripeConnectOnboarding',
  'refreshStripeConnectAccount',
  'refundStripePayment',
  'bootstrapMasterAdmin',
  'grantAdminRole',
  'signLegalAgreement',
  'generateLegalAgreementPdf',
  'sendBookingEmails',
  'sendCoachEmailVerification',
  'sendCoachLinkEmail',
  'send-email',
];

const removedFunctions = ['createPaypalOrder', 'capturePaypalOrder', 'paypalWebhook'];

const expectedCollections = [
  'organizations',
  'organization_members',
  'organization_coaches',
  'athlete_profiles',
  'guardian_athletes',
  'sports',
  'coach_sport_profiles',
  'availability_blocks',
  'athlete_availability_preferences',
  'legal_templates',
  'legal_agreements',
  'legal_admin_notes',
  'stripe_connected_accounts',
  'stripe_payment_records',
  'stripe_transfer_records',
  'stripe_webhook_events',
  'admin_assignments',
];

const expectedBuckets = ['legal-documents', 'coach-documents', 'org-logos', 'generated-receipts'];

const failures = [];
const configuredFunctions = new Map(appwrite.functions.map((fn) => [fn.$id, fn]));

for (const fnId of expectedFunctions) {
  const fn = configuredFunctions.get(fnId);
  if (!fn) {
    failures.push(`appwrite.json missing function ${fnId}`);
    continue;
  }
  if (!existsSync(join(root, fn.path, 'package.json'))) failures.push(`${fnId} missing package.json`);
  if (!existsSync(join(root, fn.path, fn.entrypoint))) failures.push(`${fnId} missing ${fn.entrypoint}`);
}

for (const fnId of removedFunctions) {
  if (configuredFunctions.has(fnId)) failures.push(`PayPal function still configured: ${fnId}`);
}

for (const collection of expectedCollections) {
  if (!clientSource.includes(`'${collection}'`)) failures.push(`COL map missing ${collection}`);
  if (!provisionSource.includes(`id: '${collection}'`)) failures.push(`provisioner missing ${collection}`);
}

for (const bucket of expectedBuckets) {
  if (!provisionSource.includes(`'${bucket}'`)) failures.push(`provisioner missing bucket ${bucket}`);
}

if (failures.length) {
  console.error('Phase 0 verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Phase 0 verification passed (${expectedFunctions.length} functions, ${expectedCollections.length} production collections).`);
