import { rpc } from '@/lib/rpc';

export async function createStripeConnectAccount({ ownerType, ownerId, email }) {
  const res = await rpc.invoke('createStripeConnectAccount', {
    owner_type: ownerType,
    owner_id: ownerId,
    email,
  });
  return res.data;
}

export async function createStripeConnectOnboarding({ ownerType, ownerId }) {
  const res = await rpc.invoke('createStripeConnectOnboarding', {
    owner_type: ownerType,
    owner_id: ownerId,
  });
  return res.data;
}

export async function refreshStripeConnectAccount({ ownerType, ownerId, stripeAccountId }) {
  const res = await rpc.invoke('refreshStripeConnectAccount', {
    owner_type: ownerType,
    owner_id: ownerId,
    stripe_account_id: stripeAccountId,
  });
  return res.data;
}

export async function refundStripePayment({ paymentRecordId, amountCents, reason }) {
  const res = await rpc.invoke('refundStripePayment', {
    payment_record_id: paymentRecordId,
    amount_cents: amountCents,
    reason,
  });
  return res.data;
}
