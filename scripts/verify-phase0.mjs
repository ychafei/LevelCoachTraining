// Phase 0 — structural verification of the production surface.
// Asserts the appwrite.json function registry, on-disk function code, the
// provisioner's collection/bucket coverage, and the COL map stay in sync.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const appwrite = JSON.parse(readFileSync(join(root, 'appwrite.json'), 'utf8'));
const clientSource = readFileSync(join(root, 'src/api/appwriteClient.js'), 'utf8');
const provisionSource = readFileSync(join(root, 'scripts/provision-appwrite.mjs'), 'utf8');

// The consolidated 24-function surface (docs/ARCHITECTURE.md §3).
const expectedFunctions = [
  // public reads
  'getPublicCoaches',
  'getCoachAvailability',
  'getMatchingPlayers',
  // payments
  'createStripeCheckout',
  'stripeWebhook',
  'stripeConnectWebhook',
  'stripeConnect',
  'refundStripePayment',
  // identity / roles
  'accountProfile',
  'bootstrapMasterAdmin',
  'grantAdminRole',
  // product
  'booking',
  'messaging',
  'training',
  'family',
  'coachSelf',
  'orgAdmin',
  'applications',
  'adminOps',
  'reviews',
  'reports',
  'emailDispatch',
  // legal
  'signLegalAgreement',
  'generateLegalAgreementPdf',
];

// Functions that must NOT exist anymore (removed/superseded surfaces).
const removedFunctions = [
  'createPaypalOrder', 'capturePaypalOrder', 'paypalWebhook',
  'send-email', 'sendBookingEmails', 'sendCoachEmailVerification', 'sendCoachLinkEmail',
  'createStripeConnectAccount', 'createStripeConnectOnboarding', 'refreshStripeConnectAccount',
  'getCoachClients',
];

// Only these functions may be executable by unauthenticated callers.
const anyExecuteAllowed = new Set([
  'stripeWebhook', 'stripeConnectWebhook', 'getPublicCoaches',
  'getCoachAvailability', 'emailDispatch', 'applications',
]);

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
  // production cutover additions
  'coach_link_requests',
  'payment_ledger_entries',
  'payout_rules',
  'notifications',
  'coach_reviews',
  'athlete_goals',
  'training_plans',
  'training_plan_items',
  'homework_assignments',
  'athlete_assessments',
  'session_check_ins',
  'safety_reports',
];

const expectedBuckets = ['legal-documents', 'coach-documents', 'org-logos', 'generated-receipts', 'progress-media'];

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
  const execute = fn.execute || [];
  if (execute.includes('any') && !anyExecuteAllowed.has(fnId)) {
    failures.push(`${fnId} is executable by 'any' but is not on the public allowlist`);
  }
}

for (const fnId of removedFunctions) {
  if (configuredFunctions.has(fnId)) failures.push(`removed function still configured: ${fnId}`);
  if (existsSync(join(root, 'functions', fnId))) failures.push(`removed function still on disk: functions/${fnId}`);
}

if (configuredFunctions.size !== expectedFunctions.length) {
  failures.push(`appwrite.json registers ${configuredFunctions.size} functions; expected exactly ${expectedFunctions.length}`);
}

for (const collection of expectedCollections) {
  if (!clientSource.includes(`'${collection}'`) && !readsCollectionViaRepo(collection)) {
    failures.push(`COL map (or repos) missing ${collection}`);
  }
  if (!provisionSource.includes(`'${collection}'`)) failures.push(`provisioner missing ${collection}`);
}

function readsCollectionViaRepo(collection) {
  // Newer repos declare their collection ids locally instead of via COL.
  try {
    const repoDir = join(root, 'src/api/repo');
    return readdirSync(repoDir).some((f) => readFileSync(join(repoDir, f), 'utf8').includes(`'${collection}'`));
  } catch {
    return false;
  }
}

for (const bucket of expectedBuckets) {
  if (!provisionSource.includes(`'${bucket}'`)) failures.push(`provisioner missing bucket ${bucket}`);
}

// Permission posture markers in the provisioner (the cutover itself).
for (const marker of ['updateCollection', 'updateBucket', "Role.label('admin')", 'documentSecurity']) {
  if (!provisionSource.includes(marker)) failures.push(`provisioner missing permission-cutover marker: ${marker}`);
}

if (failures.length) {
  console.error('Phase 0 verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Phase 0 verification passed (${expectedFunctions.length} functions, ${expectedCollections.length} collections, ${expectedBuckets.length} key buckets).`);
