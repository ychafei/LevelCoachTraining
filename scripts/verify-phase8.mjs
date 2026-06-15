// Phase 8 — prepaid transferable-credit behavior tripwires.
//
// These checks are intentionally deterministic/static: they guard the exact
// invariants that must survive refactors even when Appwrite/Stripe are not
// available in CI. They do not replace integration tests against a deployed
// stack, but they fail loudly when the repo loses an idempotency key, readds an
// immediate transfer, exposes public PII, or weakens the legal-version gates.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const failures = [];

function read(rel) {
  const path = join(root, rel);
  if (!existsSync(path)) {
    failures.push(`missing file: ${rel}`);
    return '';
  }
  return readFileSync(path, 'utf8');
}

function codeOnly(rel) {
  return read(rel)
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

function mustInclude(rel, snippet, why) {
  if (!read(rel).includes(snippet)) failures.push(`${rel} must include ${JSON.stringify(snippet)} — ${why}`);
}

function mustNotInclude(rel, snippet, why) {
  if (read(rel).includes(snippet)) failures.push(`${rel} must NOT include ${JSON.stringify(snippet)} — ${why}`);
}

function mustNotMatch(rel, regex, why) {
  if (regex.test(codeOnly(rel))) failures.push(`${rel} must NOT match ${regex} — ${why}`);
}

function scenario(number, title, checks) {
  const before = failures.length;
  checks();
  for (let i = before; i < failures.length; i += 1) {
    failures[i] = `${number}. ${title}: ${failures[i]}`;
  }
}

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}`);
  if (start < 0) return '';
  let brace = source.indexOf('{', start);
  if (brace < 0) return '';
  let depth = 0;
  for (let i = brace; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return '';
}

const checkout = 'functions/createStripeCheckout/src/main.js';
const webhook = 'functions/stripeWebhook/src/main.js';
const booking = 'functions/booking/src/main.js';
const refund = 'functions/refundStripePayment/src/main.js';
const publicCoaches = 'functions/getPublicCoaches/src/main.js';
const publicCoachLib = 'src/lib/publicCoach.js';
const coachSelf = 'functions/coachSelf/src/main.js';
const orgAdmin = 'functions/orgAdmin/src/main.js';
const signLegal = 'functions/signLegalAgreement/src/main.js';
const bookPage = 'src/pages/Book.jsx';
const pricingDurations = 'src/lib/pricingDurations.js';
const provision = 'scripts/provision-appwrite.mjs';

const publicCardBody = functionBody(read(publicCoaches), 'publicCard');
const normalizeBody = functionBody(read(publicCoachLib), 'normalizePublicCoach');

scenario(1, 'Stripe checkout does not create transfers immediately', () => {
  mustNotMatch(checkout, /transfer_data\s*:/, 'Checkout must not create destination charges.');
  mustNotMatch(checkout, /application_fee_amount/, 'Checkout must not create Connect application fees.');
  mustNotMatch(checkout, /stripe\.transfers\.create\s*\(/, 'Checkout must not create Stripe transfers.');
  mustNotMatch(webhook, /stripe\.transfers\.create\s*\(/, 'checkout.session.completed webhook path must not pay coaches/orgs.');
  mustNotMatch(webhook, /\bcoach_payout\b|\borg_payout\b/, 'checkout.session.completed must not write payout ledger entries.');
  mustInclude(webhook, "type: 'charge'", 'checkout webhook records only the platform charge.');
  mustInclude(webhook, "type: 'purchase'", 'checkout webhook records the prepaid credit purchase.');
});

scenario(2, 'checkout.session.completed creates exactly one credit on webhook retry', () => {
  mustInclude(webhook, 'deterministicCreditId(paymentRecord)', 'credit id must be deterministic per payment record.');
  mustInclude(webhook, "db.getDocument(DB_ID, 'session_credits', creditDocId)", 'retry must find existing deterministic credit.');
  mustInclude(webhook, "Query.equal('source_payment_record_id', paymentRecord.$id)", 'retry must also dedupe by source payment record.');
  mustInclude(webhook, "createDocumentWithIdSafe(db, 'session_credits', creditDocId", 'credit create must use the deterministic id.');
  mustInclude(webhook, 'if (err?.code !== 409) throw err', '409 duplicate create must be treated as idempotent.');
  mustInclude(webhook, 'creditLedgerEntryExists', 'credit ledger writes must be idempotent.');
  mustInclude(webhook, 'idempotency_key: `credit_checkout_${updated.$id}`', 'purchase ledger must dedupe on payment record.');
});

scenario(3, 'Credit bought for Coach A can book Coach B if balance is sufficient', () => {
  mustNotMatch(booking, /credit\.coach_id\s*!==\s*coach/i, 'booking must not block transferable credits by original coach_id.');
  mustNotMatch(booking, /original_coach_id\s*!==\s*coach/i, 'booking must not block by original coach.');
  mustInclude(booking, 'const originalCoachId = originalCreditCoachId(credit)', 'booking must preserve original coach only as a snapshot.');
  mustInclude(booking, 'coach_id: coach.$id', 'session coach_id must be the selected coach.');
  mustInclude(booking, 'original_credit_coach_id: originalCoachId', 'session must keep the original credit coach for reporting.');
  mustInclude(booking, 'reserveCreditValue(db, credit, priceSnapshotCents', 'selected coach booking must reserve by value, not coach lock.');
});

scenario(4, 'More expensive Coach B returns top-up amount_due_cents', () => {
  mustInclude(booking, 'if (available < amountCents)', 'reservation must compare remaining value with selected coach price.');
  mustInclude(booking, 'amount_due_cents: amountCents - available', 'insufficient value must return amount due.');
  mustInclude(booking, 'requires_top_up: reservationResult.status === 402', 'booking response must be structured as top-up-required.');
  mustInclude(booking, 'top_up_amount_cents', 'booking response must include top-up cents.');
});

scenario(5, 'Cheaper Coach B preserves leftover balance', () => {
  mustInclude(booking, "decrementDocumentAttribute(DB_ID, 'session_credits', current.$id, 'remaining_amount_cents', amountCents, 0)", 'booking must subtract only selected session price.');
  mustInclude(booking, "incrementDocumentAttribute(DB_ID, 'session_credits', current.$id, 'reserved_amount_cents', amountCents)", 'booking must reserve only selected session price.');
  mustNotMatch(booking, /remaining_amount_cents['"]?\s*:\s*0[^0-9]/, 'booking must not zero remaining balance when reserving a cheaper session.');
});

scenario(6, 'Booking reserves value atomically and cannot double-spend', () => {
  mustInclude(booking, "decrementDocumentAttribute(DB_ID, 'session_credits', current.$id, 'remaining_amount_cents', amountCents, 0)", 'atomic bounded decrement prevents negative remaining balance.');
  mustInclude(booking, "incrementDocumentAttribute(DB_ID, 'session_credits', current.$id, 'reserved_amount_cents', amountCents)", 'reserved value must be atomically incremented.');
  mustInclude(booking, "Query.equal('idempotency_key', reservationKey)", 'duplicate reservation attempts must hit the same reservation key.');
  mustInclude(booking, "createOnceByIdempotency(db, 'credit_reservations'", 'reservation document creation must be idempotent.');
  mustInclude(booking, 'if (reservationResult.duplicate && reservation.session_id)', 'duplicate booking retries must return existing session.');
});

scenario(7, 'Early cancellation restores reserved value', () => {
  mustInclude(booking, 'const restore = authority.isCoach || hoursUntil >= 24', 'early client cancellation must choose the restore path.');
  mustInclude(booking, 'if (restore) await restoreCreditReservation(db, session, error)', 'restore path must release the reservation.');
  mustInclude(booking, "status: 'released'", 'restored reservation must be marked released.');
  mustInclude(booking, "type: 'reservation_release'", 'restores must write a credit ledger restore entry.');
  mustInclude(booking, 'credit_restored: restore', 'API response must say whether credit was restored.');
});

scenario(8, 'Coach cancellation restores reserved value', () => {
  mustInclude(booking, 'const restore = authority.isCoach || hoursUntil >= 24', 'coach cancellation must restore regardless of timing.');
  mustInclude(booking, 'authority.isCoach', 'cancel authority must distinguish coach cancellations.');
  mustInclude(booking, "incrementDocumentAttribute(DB_ID, 'session_credits', reservation.credit_lot_id, 'remaining_amount_cents', amount)", 'coach cancellation restore must return value to remaining balance.');
});

scenario(9, 'Late cancellation/no-show releases payout once', () => {
  mustInclude(booking, "releaseSessionPayout(db, updated.$id, 'late_cancel_forfeiture'", 'late-cancel forfeiture must release through the shared helper.');
  mustInclude(booking, "releaseSessionPayout(db, provisional.$id, newStatus", 'no_show/earned outcomes must release through the shared helper.');
  mustInclude(booking, "case 'no_show'", 'no-show action must exist.');
  mustInclude(booking, "case 'late_cancelled_chargeable'", 'late-cancel forfeiture action must exist.');
  mustInclude(booking, 'if (payoutAlreadyReleased(session))', 'release helper must be idempotent per session.');
  mustInclude(booking, 'payoutReleaseIdForSession(session.$id)', 'release id must be deterministic per session.');
});

scenario(10, 'Completing a session releases payout once', () => {
  mustInclude(booking, "case 'complete'", 'complete action must exist.');
  mustInclude(booking, "return await statusAction(db, users, accountId, profile, payload, 'completed'", 'complete must use the shared status action.');
  mustInclude(booking, 'const payout = await releaseSessionPayout(db, provisional.$id, newStatus, error)', 'complete must release via shared helper.');
  mustInclude(booking, "idempotency_key: `ledger_${payoutReleaseId}_platform_fee`", 'platform fee ledger must be idempotent per release.');
});

scenario(11, 'Duplicate complete/no_show calls do not double-transfer', () => {
  mustInclude(booking, 'if (session.status === newStatus && payoutAlreadyReleased(session))', 'duplicate earned status calls must short-circuit after release.');
  mustInclude(booking, 'const transferIdempotencyKey = `transfer_${payoutReleaseId}_${leg.owner_type}_${leg.owner_id}_${leg.amount_cents}`', 'Stripe transfers must share deterministic idempotency keys.');
  mustInclude(booking, "createOnceByIdempotency(db, 'payout_obligations'", 'payout obligations must be idempotent.');
  mustInclude(booking, "createOnceByIdempotency(db, 'stripe_transfer_records'", 'transfer records must be idempotent.');
  mustInclude(booking, 'idempotencyKey: transferIdempotencyKey', 'Stripe transfer call must use the deterministic key.');
});

scenario(12, 'Refund reduces unused credit and reverses released transfers only when applicable', () => {
  mustInclude(refund, 'const available = creditAvailableCents(credit)', 'refund must compute unused available credit.');
  mustInclude(refund, 'const debit = Math.min(refundCents, available)', 'refund must reduce only unused credit by default.');
  mustInclude(refund, 'remaining_amount_cents: remainingAfter', 'refund must reduce remaining credit balance.');
  mustInclude(refund, 'reserved_amount_cents', 'refund must inspect reserved value.');
  mustInclude(refund, 'overrideReleasedRefund', 'released-transfer refunds require explicit policy path/override.');
  mustInclude(refund, 'releasedRefundCents > 0', 'transfer reversals must only run for released value.');
  mustInclude(refund, 'reverseTransfersForRefund', 'released refunds must reverse transfers when applicable.');
  mustInclude(refund, "type: 'transfer_reversal'", 'transfer reversals must be ledgered.');
  mustInclude(refund, 'idempotencyKey: `rev_${transfer.transfer_id}_${target}`', 'transfer reversals must be idempotent.');
});

scenario(13, 'Dispute freezes affected credit', () => {
  mustInclude(webhook, 'charge.dispute.created', 'Stripe dispute created event must be handled.');
  mustInclude(webhook, 'freezeUnusedCredit', 'dispute handler must freeze unused credit.');
  mustInclude(webhook, "type: 'dispute_freeze'", 'credit ledger must record the freeze.');
  mustInclude(webhook, "status: 'frozen'", 'affected credit must be frozen.');
  mustInclude(booking, "String(credit?.status || 'active') === 'frozen'", 'payout release must block frozen credits.');
  mustInclude(booking, "String(credit.status || 'active') !== 'active'", 'booking must block frozen credits.');
});

scenario(14, 'Public coach API never exposes PII or fee config', () => {
  const forbidden = [
    'email',
    'phone',
    'user_id',
    'stripe_account_id',
    'stripe_connected_account_id',
    'platform_fee_bps',
    'platform_fee_type',
    'platform_fee_value',
    'internal_verification_notes',
    'verification_notes',
  ];
  for (const field of forbidden) {
    if (new RegExp(`\\b${field}\\s*:`).test(publicCardBody)) {
      failures.push(`${publicCoaches} publicCard exposes forbidden field ${field}`);
    }
    if (new RegExp(`['"]${field}['"]`).test(read(publicCoachLib))) {
      failures.push(`${publicCoachLib} allowlist includes forbidden field ${field}`);
    }
  }
  if (!publicCardBody.includes('public_verified')) failures.push(`${publicCoaches} should expose only coarse public_verified status, not private verification data`);
  if (!normalizeBody.includes('pickAllowed')) failures.push(`${publicCoachLib} normalizePublicCoach must defensively allowlist fields`);
  mustInclude(publicCoaches, 'doc.published === true && doc.is_active === true', 'public API must show only explicitly published active coaches.');
});

scenario(15, 'Legal template version bump requires re-signing before checkout/booking/publish', () => {
  for (const rel of [checkout, booking, coachSelf]) {
    mustInclude(rel, 'activeRequired', 'legal gate must use active required templates.');
    mustInclude(rel, 'agreement.template_version === template.version', 'template version changes must invalidate older signatures.');
    mustInclude(rel, 'agreement.template_checksum === template.checksum', 'template checksum changes must invalidate older signatures.');
  }
  mustInclude(checkout, 'legalPacketComplete(db, profile, athleteId)', 'checkout must require current buyer legal packet.');
  mustNotInclude(checkout, 'coachLegalPacketComplete(db, coach)', 'checkout must not require coach legal packet before platform payment.');
  mustNotInclude(checkout, 'Coach is not ready to accept payments yet.', 'checkout must not block platform payment on coach payout readiness.');
  mustInclude(booking, 'legalPacketCompleteFor(db, profile, signerRole, athlete?.$id)', 'booking must require current athlete/guardian legal packet.');
  mustInclude(coachSelf, 'coachLegalPacketComplete(databases, profile, coach)', 'publish must require current coach legal packet.');
});

scenario(16, 'Pricing packages support multiple duration/price options', () => {
  mustInclude(provision, "await attrString('pricing_packages', 'duration_options', 20000)", 'schema must provision duration options JSON.');
  mustInclude(pricingDurations, 'normalizeDurationOptions', 'frontend must normalize package duration options.');
  mustInclude(pricingDurations, 'discountPercentForOption', 'frontend must calculate hourly discount display.');
  mustInclude(coachSelf, 'duration_options: JSON.stringify(durationOptions)', 'coach package save must persist duration options.');
  mustInclude(orgAdmin, 'duration_options: JSON.stringify(durationOptions)', 'org package save must persist duration options.');
  mustInclude(coachSelf, 'duration_minutes: primary.duration_minutes', 'coach package save must mirror primary duration for compatibility.');
  mustInclude(orgAdmin, 'price_cents: primary.price_cents', 'org package save must mirror primary price for compatibility.');
  mustInclude(bookPage, 'STEP_DURATION', 'booking flow must include duration step when a package has multiple options.');
  mustInclude(bookPage, 'selectedDurationOptions', 'booking flow must render package-specific duration options.');
});

scenario(17, 'Client booking flow removes format and captures coach message/location', () => {
  mustNotMatch(booking, /\bsession_format\b/, 'server booking must not accept or store old format selections.');
  mustNotMatch(checkout, /\bsession_format\b/, 'checkout must not accept or store old format selections.');
  mustNotMatch(bookPage, /\bSTEP_FORMAT\b|\bselectedSessionFormat\b|\bformatOptions\b/, 'client booking wizard must not show the old format step.');
  mustInclude(bookPage, 'Details for the coach', 'client flow must ask for coach-facing details before payment/scheduling.');
  mustNotInclude(bookPage, 'booking_location_label: bookingLocation.label', 'checkout payload must not send old geocoded location fields.');
  mustInclude(bookPage, 'preferred_location: preferredLocation.trim()', 'checkout payload must carry preferred location.');
  mustInclude(checkout, "status: 'not_geocoded'", 'checkout must tolerate stale incomplete geocoded location payloads.');
  mustInclude(booking, 'const preferredLocation = cleanText(payload.preferred_location || payload.preferredLocation || \'\', 1000)', 'booking must sanitize preferred location server-side.');
  mustInclude(booking, 'client_message: notes', 'reservation metadata must capture the client message.');
  mustInclude(booking, 'preferred_location: preferredLocation', 'session must store preferred location snapshot.');
});

scenario(18, 'Credit top-up charges only the difference and grants transferable value', () => {
  mustInclude(checkout, "requestedPurpose === 'credit_top_up'", 'checkout must recognize top-up requests.');
  mustInclude(checkout, 'amount = Math.max(0, topUpSessionPrice - topUpRemaining)', 'top-up amount must be only the selected-session difference.');
  mustInclude(checkout, "purpose: topUpRequested ? 'credit_top_up' : 'prepaid_credit'", 'payment record and Stripe metadata must identify top-ups.');
  mustInclude(webhook, 'applyCreditTopUpIfMissing', 'webhook must apply top-up value to the existing credit.');
  mustInclude(webhook, "type: 'top_up'", 'top-up must write credit ledger type top_up.');
  mustInclude(webhook, "incrementDocumentAttribute(DB_ID, 'session_credits', credit.$id, 'remaining_amount_cents', amountCents)", 'top-up must atomically increase remaining credit value.');
});

scenario(19, 'Legal signing succeeds even if PDF generation is deferred', () => {
  mustInclude(signLegal, 'resolveSignerRole', 'server must resolve requested signer role from verified account data.');
  mustInclude(signLegal, 'canSignAsOrganization', 'organization signing must be verified server-side.');
  mustInclude(signLegal, 'canSignAsGuardian', 'guardian signing must be verified server-side.');
  mustInclude(signLegal, 'isAdminRole', 'admin signing must be explicitly recognized.');
  mustInclude(signLegal, 'PDF generation deferred', 'PDF/storage failures must not make the signature fail.');
  mustInclude(signLegal, 'pdf_pending', 'response/audit must expose deferred PDF state.');
  mustInclude(signLegal, "return res.json({\n      agreement_id: updated.$id", 'successful signing must still return agreement_id.');
});

scenario(20, 'Coach publish gate auto-creates starter package and public cards require package-derived price', () => {
  mustInclude(coachSelf, 'ensureStarterPackageFromPriceHint', 'publish checklist must create a starter package from starting price.');
  mustInclude(coachSelf, "name: 'Single Session'", 'starter package must be named Single Session.');
  mustInclude(coachSelf, "checklistItem('starting_price'", 'publish checklist must show missing starting price explicitly.');
  mustInclude(coachSelf, "checklistItem('pricing'", 'publish checklist must show package/pricing status explicitly.');
  mustInclude(publicCoaches, 'durationOptions(pkg)', 'public price hints must inspect duration options.');
  mustInclude(publicCoaches, 'const visible = visibleBase.filter((doc) => priceHints.has(doc.$id))', 'public coaches must have an active package-derived price hint.');
  mustInclude(publicCoaches, 'publicMinimumComplete', 'public API must keep incomplete old published rows out of marketplace results.');
});

if (failures.length) {
  console.error('Phase 8 verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Phase 8 verification passed (20 prepaid-credit, payout, privacy, legal, and booking-flow invariants hold).');
