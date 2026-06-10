// Phase 7 — production-cutover invariants.
// These are structural tripwires for the security/payments architecture
// (docs/ARCHITECTURE.md). They cannot prove runtime behavior, but they fail
// loudly if a future change reintroduces a known-fatal pattern.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

function src(rel) {
  const p = join(root, rel);
  if (!existsSync(p)) {
    failures.push(`missing file: ${rel}`);
    return '';
  }
  return readFileSync(p, 'utf8');
}

function mustInclude(rel, marker, why) {
  if (!src(rel).includes(marker)) failures.push(`${rel} must contain ${JSON.stringify(marker)} — ${why}`);
}

function mustNotMatch(rel, regex, why) {
  const code = src(rel).replace(/^\s*\/\/.*$/gm, ''); // strip line comments
  if (regex.test(code)) failures.push(`${rel} must NOT match ${regex} — ${why}`);
}

// ── Payments: separate charges & transfers ───────────────────────────────────
mustNotMatch('functions/createStripeCheckout/src/main.js', /transfer_data\s*:/, 'checkout must not use destination charges; splits happen via webhook transfers');
mustNotMatch('functions/createStripeCheckout/src/main.js', /application_fee_amount/, 'platform fee is a ledger split, not a Connect application fee');
mustInclude('functions/createStripeCheckout/src/main.js', 'payout_plan', 'server-computed split plan must ride in metadata');
mustInclude('functions/createStripeCheckout/src/main.js', 'PLATFORM_FEE_BPS', 'platform fee default must come from env (bps)');
mustInclude('functions/stripeWebhook/src/main.js', 'transfers.create', 'webhook must create real Stripe transfers for payout legs');
mustInclude('functions/stripeWebhook/src/main.js', 'source_transaction', 'transfers must be tied to the charge');
mustInclude('functions/stripeWebhook/src/main.js', 'constructEvent', 'webhook signature verification is mandatory');
mustInclude('functions/stripeWebhook/src/main.js', 'payment_ledger_entries', 'every money movement writes the ledger');
mustInclude('functions/refundStripePayment/src/main.js', 'createReversal', 'refunds must reverse payout transfers');
mustInclude('functions/refundStripePayment/src/main.js', 'request_id', 'refunds must be idempotent per request');
mustInclude('functions/stripeConnectWebhook/src/main.js', 'account.updated', 'Connect account status must sync via webhook');

// ── Authorization: labels + server-only profile writes ──────────────────────
mustNotMatch('functions/accountProfile/src/main.js', /payload\.role\b/, 'clients must never set their own role');
mustInclude('functions/refundStripePayment/src/main.js', 'labels', 'refund authority comes from account labels, not client-writable profile.role');
mustInclude('functions/grantAdminRole/src/main.js', 'superadmin', 'role grants require the superadmin label');
mustNotMatch('functions/bootstrapMasterAdmin/src/main.js', /@gmail\.com/, 'no hardcoded owner email — MASTER_ADMIN_EMAIL env only');
mustNotMatch('src/components/guards/RouteGuards.jsx', /@gmail\.com/, 'no hardcoded owner email in the client bundle');
mustNotMatch('src/lib/auth.js', /createDocument\(/, 'profiles are created server-side via accountProfile.ensure');

// ── Privacy ──────────────────────────────────────────────────────────────────
mustNotMatch('functions/getCoachAvailability/src/main.js', /client_email|client_name/, 'public availability must never expose session PII');
mustNotMatch('functions/getMatchingPlayers/src/main.js', /requester_email|\bemail:\s*p/, 'matching results must not expose emails');

// ── Email safety ─────────────────────────────────────────────────────────────
if (existsSync(join(root, 'functions/send-email'))) failures.push('open relay functions/send-email must stay deleted');
mustInclude('functions/emailDispatch/src/main.js', 'createHmac', 'unsubscribe must be token-verified');
mustNotMatch('functions/emailDispatch/src/main.js', /api\.resend\.com/, 'emailDispatch must have no send capability');

// ── Permission model ─────────────────────────────────────────────────────────
const provisioner = src('scripts/provision-appwrite.mjs');
if (!provisioner.includes('updateCollection')) failures.push('provisioner must enforce permissions on existing collections (updateCollection)');
if (!provisioner.includes("Role.label('admin')")) failures.push('provisioner must use label-based admin grants');
if (/Permission\.update\(Role\.users\(\)\)/.test(provisioner)) failures.push('no collection may grant blanket update to all users');
if (/Permission\.delete\(Role\.users\(\)\)/.test(provisioner)) failures.push('no collection may grant blanket delete to all users');

// ── Legal & minors ───────────────────────────────────────────────────────────
mustInclude('functions/signLegalAgreement/src/main.js', 'guardian_athletes', 'guardian signings must bind to a linked athlete');
mustInclude('functions/booking/src/main.js', 'is_minor', 'minors cannot book without a guardian');
mustInclude('functions/createStripeCheckout/src/main.js', 'legalPacketComplete', 'checkout is gated on the signed legal packet');

// ── Deployment hardening ─────────────────────────────────────────────────────
mustInclude('vercel.json', 'Content-Security-Policy', 'production must ship a CSP');
mustInclude('vercel.json', 'Strict-Transport-Security', 'production must ship HSTS');

if (failures.length) {
  console.error('Phase 7 verification failed:');
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log('Phase 7 verification passed (production-cutover invariants hold).');
