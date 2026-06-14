// Phase 3 — payments (prepaid credits, delayed transfers, splits, refunds).
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const failures = [];
const read = (p) => readFileSync(join(root, p), 'utf8');
const codeOnly = (p) => read(p).replace(/^\s*\/\/.*$/gm, '');
const check = (ok, msg) => { if (!ok) failures.push(msg); };
const includes = (path, snippets) => {
  const content = read(path);
  for (const s of snippets) check(content.includes(s), `${path} is missing: ${s}`);
};

for (const file of [
  'functions/createStripeCheckout/src/main.js',
  'functions/stripeWebhook/src/main.js',
  'functions/stripeConnect/src/main.js',
  'functions/stripeConnectWebhook/src/main.js',
  'functions/refundStripePayment/src/main.js',
]) check(existsSync(join(root, file)), `Missing required Phase 3 file: ${file}`);

includes('functions/createStripeCheckout/src/main.js', [
  'legalPacketComplete',
  'merchant_of_record',
  'prepaid_credit',
  'Coach is not ready to accept payments yet.',
]);
check(!codeOnly('functions/createStripeCheckout/src/main.js').includes('payout_plan'), 'createStripeCheckout must not embed payout_plan in checkout metadata');
check(!/transfer_data\s*:/.test(codeOnly('functions/createStripeCheckout/src/main.js')), 'createStripeCheckout must not use transfer_data');

includes('functions/stripeWebhook/src/main.js', [
  'constructEvent',
  "type: 'charge'",
  'purchase',
  'payment_ledger_entries',
  'charge.dispute.created',
  'stripe_webhook_events',
]);
check(!/transfers\.create\s*\(/.test(codeOnly('functions/stripeWebhook/src/main.js')), 'stripeWebhook must not pay coach/org at checkout');

includes('functions/booking/src/main.js', [
  'price_snapshot_cents',
  'payout_plan_snapshot',
  'releaseSessionPayout',
  'release_pending_retry',
  'credit_reservations',
  'payout_obligations',
  'transfers.create',
  'PLATFORM_FEE_BPS',
]);

includes('functions/refundStripePayment/src/main.js', [
  'createReversal',
  'request_id',
  'labels',
]);

includes('functions/stripeConnectWebhook/src/main.js', [
  'account.updated',
  'STRIPE_CONNECT_WEBHOOK_SECRET',
]);

// Admin refunds send idempotency request ids and integer cents.
includes('src/pages/admin/AdminPayments.jsx', ['request_id', 'amount_cents']);

// The credits unit of value is never client-creatable.
const creditRepo = read('src/api/repo/sessionCreditRepo.js');
check(!creditRepo.includes('createDocument('), 'sessionCreditRepo must not create credits client-side');

if (failures.length) {
  console.error('Phase 3 verification failed:');
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log('Phase 3 verification passed.');
