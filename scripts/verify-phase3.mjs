import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function read(path) {
  return readFileSync(join(root, path), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function includes(path, snippets) {
  const content = read(path);
  for (const snippet of snippets) {
    assert(content.includes(snippet), `${path} is missing: ${snippet}`);
  }
}

function excludes(path, snippets) {
  const content = read(path);
  for (const snippet of snippets) {
    assert(!content.includes(snippet), `${path} still contains: ${snippet}`);
  }
}

const requiredFiles = [
  'functions/createStripeCheckout/src/main.js',
  'functions/stripeWebhook/src/main.js',
  'functions/createStripeConnectAccount/src/main.js',
  'functions/createStripeConnectOnboarding/src/main.js',
  'functions/refreshStripeConnectAccount/src/main.js',
  'functions/refundStripePayment/package.json',
  'functions/refundStripePayment/src/main.js',
  'src/lib/stripeConnect.js',
  'src/pages/admin/AdminPayments.jsx',
];

for (const file of requiredFiles) {
  assert(existsSync(join(root, file)), `Missing required Phase 3 file: ${file}`);
}

assert(!existsSync(join(root, 'src/components/PayPalCheckout.jsx')), 'PayPalCheckout component still exists');
assert(!existsSync(join(root, 'src/components/shared/PaymentHandles.jsx')), 'PaymentHandles component still exists');

excludes('package.json', ['@paypal/react-paypal-js']);
excludes('src/pages/Book.jsx', [
  'PayPalCheckout',
  'cash_pending',
  "payment_method === 'cash'",
  'setPaymentMethod',
]);
excludes('src/pages/Pay.jsx', ['paypal.me', 'Venmo', 'Zelle', 'Cash App']);
excludes('src/pages/coach/CoachEarnings.jsx', ['draftHandles', 'Payment Handles', 'Pending Cash']);

includes('src/pages/Book.jsx', [
  'StripeCheckout',
  'stripeSuccess',
  "c.payment_processor === 'stripe'",
  'Payment received. Waiting for Stripe',
]);

includes('src/components/StripeCheckout.jsx', [
  'createStripeCheckout',
  'coachId',
  'Continue to Stripe Checkout',
  'verified webhook',
]);

includes('functions/createStripeCheckout/src/main.js', [
  'legalPacketComplete',
  'calculateAmountCents',
  'payment_intent_data',
  'transfer_data',
  'application_fee_amount',
  'stripe_payment_records',
]);

includes('functions/stripeWebhook/src/main.js', [
  'constructEvent',
  'stripe_webhook_events',
  'checkout.session.completed',
  'charge.refunded',
  'refund.updated',
  'createCreditIfMissing',
]);

includes('functions/refundStripePayment/src/main.js', [
  'Admin access required.',
  'stripe.refunds.create',
  'closeCreditIfFullyRefunded',
  "action: 'stripe.refund'",
]);

includes('functions/createStripeConnectAccount/src/main.js', [
  'canManageOwner',
  'stripe.accounts.create',
  'stripe_connected_accounts',
  'controller',
]);

includes('functions/createStripeConnectOnboarding/src/main.js', [
  'canManageOwner',
  'accountLinks.create',
  'stripe_return=1',
]);

includes('functions/refreshStripeConnectAccount/src/main.js', [
  'findConnectedAccount',
  'canManageOwner',
  'accounts.retrieve',
  'requirements_due',
]);

includes('scripts/provision-appwrite.mjs', [
  "'stripe_account_id'",
  "'charge_id'",
  "'refund_id'",
  "'refunded_amount'",
  "['electronic', 'credits']",
  "['stripe', 'admin_grant']",
]);

includes('appwrite.json', [
  '"$id": "refundStripePayment"',
  '"path": "functions/refundStripePayment"',
  '"databases.write"',
]);

includes('src/pages/admin/AdminPayments.jsx', [
  'stripePaymentRecordRepo',
  'stripeTransferRecordRepo',
  'stripeWebhookEventRepo',
  'refundStripePayment',
]);

includes('src/App.jsx', [
  'AdminPayments',
  'path="/admin/payments"',
]);

includes('src/pages/coach/CoachEarnings.jsx', [
  'createStripeConnectAccount',
  'createStripeConnectOnboarding',
  'refreshStripeConnectAccount',
  'Stripe Connect',
]);

includes('src/pages/organization/OrganizationPortal.jsx', [
  'createStripeConnectAccount',
  'createStripeConnectOnboarding',
  'refreshStripeConnectAccount',
]);

console.log('Phase 3 verification passed.');
