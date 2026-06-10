import { callFn } from '@/lib/rpc';

// Consolidated Stripe Connect surface — everything routes through the single
// `stripeConnect` Appwrite Function ({ action, owner_type, owner_id }) which
// authorizes the caller against the actual owner (coach account / org
// owner+admin / platform admin) server-side.

export function createAccount({ owner_type, owner_id }) {
  return callFn('stripeConnect', { action: 'createAccount', owner_type, owner_id });
}

export function onboardingLink({ owner_type, owner_id }) {
  return callFn('stripeConnect', { action: 'onboardingLink', owner_type, owner_id });
}

export function refresh({ owner_type, owner_id, stripe_account_id }) {
  return callFn('stripeConnect', {
    action: 'refresh',
    owner_type,
    owner_id,
    ...(stripe_account_id ? { stripe_account_id } : {}),
  });
}

// Express dashboard login link.
export function dashboardLink({ owner_type, owner_id }) {
  return callFn('stripeConnect', { action: 'dashboardLink', owner_type, owner_id });
}

// Admin-only refunds. `request_id` is the Stripe idempotency anchor —
// generate it ONCE per user intent with crypto.randomUUID() in the caller so
// retries of the same intent never double-refund.
export function refundPayment({ payment_record_id, amount_cents, request_id, reason }) {
  return callFn('refundStripePayment', {
    payment_record_id,
    request_id,
    ...(amount_cents != null ? { amount_cents } : {}),
    ...(reason ? { reason } : {}),
  });
}

// --- Legacy-named wrappers ----------------------------------------------------
// Pre-cutover pages import these names (camelCase params). They now delegate
// to the consolidated function; Wave-2b page rewrites should switch to the
// snake_case API above.

export function createStripeConnectAccount({ ownerType, ownerId }) {
  return createAccount({ owner_type: ownerType, owner_id: ownerId });
}

export function createStripeConnectOnboarding({ ownerType, ownerId }) {
  return onboardingLink({ owner_type: ownerType, owner_id: ownerId });
}

export function refreshStripeConnectAccount({ ownerType, ownerId, stripeAccountId }) {
  return refresh({ owner_type: ownerType, owner_id: ownerId, stripe_account_id: stripeAccountId });
}

export function refundStripePayment({ paymentRecordId, amountCents, reason, requestId }) {
  return refundPayment({
    payment_record_id: paymentRecordId,
    amount_cents: amountCents,
    // Legacy callers don't carry an idempotency key — generate one per call.
    request_id: requestId || crypto.randomUUID(),
    reason,
  });
}
