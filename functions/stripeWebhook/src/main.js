import { Client, Databases, ID, Query } from 'node-appwrite';
import Stripe from 'stripe';

const DB_ID = process.env.APPWRITE_DATABASE_ID || 'lctraining';
const STRIPE_API_VERSION = process.env.STRIPE_API_VERSION || '2026-02-25.clover';

function databases() {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://nyc.cloud.appwrite.io/v1')
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);
  return new Databases(client);
}

function rawBody(req) {
  if (typeof req.bodyRaw === 'string') return req.bodyRaw;
  if (typeof req.body === 'string') return req.body;
  return JSON.stringify(req.bodyJson || {});
}

async function createWebhookEvent(db, event) {
  try {
    return await db.createDocument(DB_ID, 'stripe_webhook_events', ID.unique(), {
      stripe_event_id: event.id,
      type: event.type,
      status: 'processing',
      payload: JSON.stringify(event).slice(0, 100000),
    });
  } catch (err) {
    if (err?.code === 409) return null;
    throw err;
  }
}

async function firstDocument(db, collection, queries) {
  const rows = await db.listDocuments(DB_ID, collection, [...queries, Query.limit(1)]);
  return rows.documents[0] || null;
}

async function findPaymentRecord(db, { checkoutSessionId = '', paymentIntentId = '', chargeId = '' }) {
  if (checkoutSessionId) {
    const row = await firstDocument(db, 'stripe_payment_records', [Query.equal('checkout_session_id', checkoutSessionId)]).catch(() => null);
    if (row) return row;
  }
  if (paymentIntentId) {
    const row = await firstDocument(db, 'stripe_payment_records', [Query.equal('payment_intent_id', paymentIntentId)]).catch(() => null);
    if (row) return row;
  }
  if (chargeId) {
    const row = await firstDocument(db, 'stripe_payment_records', [Query.equal('charge_id', chargeId)]).catch(() => null);
    if (row) return row;
  }
  return null;
}

async function ensurePaymentRecord(db, session, paymentIntent) {
  const metadata = session.metadata || {};
  const paymentIntentId = typeof session.payment_intent === 'string'
    ? session.payment_intent
    : session.payment_intent?.id || '';
  let paymentRecord = await findPaymentRecord(db, {
    checkoutSessionId: session.id,
    paymentIntentId,
  });
  if (paymentRecord) return paymentRecord;

  return db.createDocument(DB_ID, 'stripe_payment_records', ID.unique(), {
    booking_id: metadata.booking_id || session.client_reference_id || '',
    checkout_session_id: session.id,
    payment_intent_id: paymentIntentId,
    charge_id: typeof paymentIntent?.latest_charge === 'string' ? paymentIntent.latest_charge : paymentIntent?.latest_charge?.id || '',
    amount: Number(session.amount_total || paymentIntent?.amount || 0),
    application_fee: Number(paymentIntent?.application_fee_amount || 0),
    transfer_destination: paymentIntent?.transfer_data?.destination || '',
    status: 'created',
    metadata: JSON.stringify(metadata),
    currency: session.currency || paymentIntent?.currency || 'usd',
  });
}

async function createCreditIfMissing(db, paymentRecord, session) {
  if (paymentRecord.credit_id) return paymentRecord.credit_id;
  const metadata = session.metadata || {};
  if (!metadata.package_id) return '';

  const sessions = Number.parseInt(metadata.package_sessions || '1', 10) || 1;
  const duration = Number.parseInt(metadata.session_duration_minutes || '60', 10) || 60;
  const amount = Number(session.amount_total || paymentRecord.amount || 0);
  const customerName = session.customer_details?.name || metadata.client_name || '';
  const customerEmail = session.customer_details?.email || session.customer_email || metadata.client_email || '';

  const credit = await db.createDocument(DB_ID, 'session_credits', ID.unique(), {
    client_email: customerEmail,
    client_name: customerName,
    package_id: metadata.package_id,
    package_name: metadata.package_name || 'Training sessions',
    total_credits: sessions,
    used_credits: 0,
    session_duration_minutes: duration,
    per_session_base_price: Math.round((amount / 100) / sessions),
    payment_processor: 'stripe',
  });
  return credit.$id;
}

async function recordTransferIfNeeded(db, paymentRecord, paymentIntent) {
  const destination = paymentRecord.transfer_destination || paymentIntent?.transfer_data?.destination || '';
  if (!destination || !paymentRecord.$id) return;
  const existing = await firstDocument(db, 'stripe_transfer_records', [
    Query.equal('payment_record_id', paymentRecord.$id),
  ]).catch(() => null);
  if (existing) return;

  const amount = Math.max(0, Number(paymentRecord.amount || paymentIntent?.amount || 0) - Number(paymentRecord.application_fee || 0));
  await db.createDocument(DB_ID, 'stripe_transfer_records', ID.unique(), {
    payment_record_id: paymentRecord.$id,
    destination_account_id: destination,
    amount,
    status: 'paid',
    transfer_id: '',
  }).catch(() => {});
}

async function handleCheckoutCompleted(db, stripe, session) {
  const paymentIntentId = typeof session.payment_intent === 'string'
    ? session.payment_intent
    : session.payment_intent?.id || '';
  const paymentIntent = paymentIntentId
    ? await stripe.paymentIntents.retrieve(paymentIntentId).catch(() => null)
    : null;
  const paymentRecord = await ensurePaymentRecord(db, session, paymentIntent);
  const creditId = await createCreditIfMissing(db, paymentRecord, session);
  const chargeId = typeof paymentIntent?.latest_charge === 'string' ? paymentIntent.latest_charge : paymentIntent?.latest_charge?.id || '';

  const updated = await db.updateDocument(DB_ID, 'stripe_payment_records', paymentRecord.$id, {
    credit_id: creditId || paymentRecord.credit_id || '',
    payment_intent_id: paymentIntentId || paymentRecord.payment_intent_id || '',
    charge_id: chargeId || paymentRecord.charge_id || '',
    status: 'paid',
    webhook_processed_at: new Date().toISOString(),
    currency: session.currency || paymentIntent?.currency || paymentRecord.currency || 'usd',
  });
  await recordTransferIfNeeded(db, updated, paymentIntent);
}

async function markPayment(db, lookup, status, data = {}) {
  const paymentRecord = await findPaymentRecord(db, lookup);
  if (!paymentRecord) return false;
  await db.updateDocument(DB_ID, 'stripe_payment_records', paymentRecord.$id, {
    ...data,
    status,
    webhook_processed_at: new Date().toISOString(),
  });
  return true;
}

async function closeCreditIfFullyRefunded(db, paymentRecord, refundedAmount) {
  if (!paymentRecord?.credit_id) return;
  if (Number(refundedAmount || 0) < Number(paymentRecord.amount || 0)) return;
  const credit = await db.getDocument(DB_ID, 'session_credits', paymentRecord.credit_id).catch(() => null);
  if (!credit) return;
  const total = Number(credit.total_credits || 0);
  const used = Number(credit.used_credits || 0);
  if (total > used) {
    await db.updateDocument(DB_ID, 'session_credits', credit.$id, { used_credits: total }).catch(() => {});
  }
}

async function markTransferReversed(db, paymentRecord) {
  if (!paymentRecord?.$id) return;
  const transfer = await firstDocument(db, 'stripe_transfer_records', [
    Query.equal('payment_record_id', paymentRecord.$id),
  ]).catch(() => null);
  if (!transfer) return;
  await db.updateDocument(DB_ID, 'stripe_transfer_records', transfer.$id, {
    status: 'reversed',
  }).catch(() => {});
}

async function handleRefundLike(db, object) {
  const paymentIntentId = typeof object.payment_intent === 'string' ? object.payment_intent : object.payment_intent?.id || '';
  const chargeId = object.object === 'charge'
    ? object.id
    : typeof object.charge === 'string'
      ? object.charge
      : object.charge?.id || '';
  const refundedAmount = object.object === 'charge'
    ? Number(object.amount_refunded || 0)
    : Number(object.amount || 0);
  const refundId = object.object === 'refund' ? object.id : '';
  const paymentRecord = await findPaymentRecord(db, { paymentIntentId, chargeId });
  if (!paymentRecord) return false;

  const fullRefund = refundedAmount >= Number(paymentRecord.amount || 0) || object.refunded === true;
  await db.updateDocument(DB_ID, 'stripe_payment_records', paymentRecord.$id, {
    charge_id: chargeId || paymentRecord.charge_id || '',
    refund_id: refundId || paymentRecord.refund_id || '',
    refunded_amount: refundedAmount,
    status: fullRefund ? 'refunded' : 'paid',
    webhook_processed_at: new Date().toISOString(),
  });
  if (fullRefund) {
    await closeCreditIfFullyRefunded(db, paymentRecord, refundedAmount);
    await markTransferReversed(db, paymentRecord);
  }
  return true;
}

export default async ({ req, res, error }) => {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'missing', { apiVersion: STRIPE_API_VERSION });
  let event;
  try {
    const signature = req.headers?.['stripe-signature'] || req.headers?.['Stripe-Signature'];
    if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
      return res.json({ error: 'Stripe webhook signature configuration missing.' }, 400);
    }
    event = stripe.webhooks.constructEvent(rawBody(req), signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    error?.(`[stripeWebhook] signature verification failed: ${err?.message || err}`);
    return res.json({ error: 'Invalid Stripe webhook signature.' }, 400);
  }

  const db = databases();
  const webhookRecord = await createWebhookEvent(db, event);
  if (!webhookRecord) {
    return res.json({ received: true, duplicate: true });
  }

  try {
    const object = event.data.object;
    let handled = true;
    if (event.type === 'checkout.session.completed') {
      await handleCheckoutCompleted(db, stripe, object);
    } else if (event.type === 'checkout.session.async_payment_failed') {
      await markPayment(db, { checkoutSessionId: object.id }, 'failed', {
        failure_reason: 'async_payment_failed',
      });
    } else if (event.type === 'payment_intent.payment_failed') {
      await markPayment(db, { paymentIntentId: object.id }, 'failed', {
        failure_reason: object.last_payment_error?.message || 'payment_intent.payment_failed',
      });
    } else if (event.type === 'payment_intent.canceled') {
      await markPayment(db, { paymentIntentId: object.id }, 'cancelled', {
        failure_reason: object.cancellation_reason || 'payment_intent.canceled',
      });
    } else if (event.type === 'charge.refunded' || event.type === 'refund.created' || event.type === 'refund.updated') {
      handled = await handleRefundLike(db, object);
    } else {
      handled = false;
    }

    await db.updateDocument(DB_ID, 'stripe_webhook_events', webhookRecord.$id, {
      status: handled ? 'processed' : 'ignored',
      processed_at: new Date().toISOString(),
    });
    return res.json({ received: true, handled });
  } catch (err) {
    error?.(`[stripeWebhook] ${event.id}: ${err?.message || err}`);
    await db.updateDocument(DB_ID, 'stripe_webhook_events', webhookRecord.$id, {
      status: 'failed',
      error: err?.message || String(err),
    }).catch(() => {});
    return res.json({ error: 'Stripe webhook processing failed.' }, 500);
  }
};
