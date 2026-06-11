import { Client, Databases, ID, Permission, Query, Role } from 'node-appwrite';
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

// Claim the event for processing. Returns null when the event is a true
// duplicate (already processed/ignored, or another invocation is actively
// working on it). Events that previously FAILED — or stalled mid-processing
// for over 10 minutes (e.g. a timeout) — are reclaimed so Stripe's automatic
// retries can repair partial work; every handler below is idempotent.
async function createWebhookEvent(db, event) {
  try {
    return await db.createDocument(DB_ID, 'stripe_webhook_events', ID.unique(), {
      stripe_event_id: event.id,
      type: event.type,
      status: 'processing',
      payload: JSON.stringify(event).slice(0, 100000),
    });
  } catch (err) {
    if (err?.code !== 409) throw err;
    const existing = await firstDocument(db, 'stripe_webhook_events', [
      Query.equal('stripe_event_id', event.id),
    ]).catch(() => null);
    if (!existing) return null;
    const stalled = existing.status === 'processing'
      && Date.now() - new Date(existing.$createdAt).getTime() > 10 * 60 * 1000;
    if (existing.status === 'failed' || stalled) {
      return db.updateDocument(DB_ID, 'stripe_webhook_events', existing.$id, {
        status: 'processing',
        error: '',
      }).catch(() => null);
    }
    return null;
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

function parseJson(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(String(value)); } catch { return {}; }
}

function bpsInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 10000 ? n : null;
}

// Server-computed split written into checkout metadata by createStripeCheckout.
function parsePayoutPlan(metadata) {
  const plan = parseJson(metadata.payout_plan);
  const platformBps = bpsInt(plan.platform_bps);
  const coachBps = bpsInt(plan.coach_bps);
  const orgBps = bpsInt(plan.org_bps);
  if (platformBps === null || coachBps === null || orgBps === null) return null;
  if (platformBps + coachBps + orgBps !== 10000) return null;
  return {
    platform_bps: platformBps,
    coach_bps: coachBps,
    org_bps: orgBps,
    coach_id: String(plan.coach_id || ''),
    organization_id: String(plan.organization_id || ''),
    coach_account_id: String(plan.coach_account_id || ''),
    org_account_id: String(plan.org_account_id || ''),
  };
}

// Creates a document with per-document grants; retries without grants if the
// grant target is invalid (e.g. deleted account) so webhooks stay processable.
async function createDocumentSafe(db, collection, data, permissions = []) {
  if (permissions.length > 0) {
    try {
      return await db.createDocument(DB_ID, collection, ID.unique(), data, permissions);
    } catch (err) {
      if (err?.code === 409) throw err;
      return db.createDocument(DB_ID, collection, ID.unique(), data);
    }
  }
  return db.createDocument(DB_ID, collection, ID.unique(), data);
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

  const amount = Number(session.amount_total || paymentIntent?.amount || 0);
  const plan = parsePayoutPlan(metadata);
  return db.createDocument(DB_ID, 'stripe_payment_records', ID.unique(), {
    booking_id: metadata.booking_id || session.client_reference_id || '',
    checkout_session_id: session.id,
    payment_intent_id: paymentIntentId,
    charge_id: typeof paymentIntent?.latest_charge === 'string' ? paymentIntent.latest_charge : paymentIntent?.latest_charge?.id || '',
    amount,
    application_fee: plan ? Math.floor((amount * plan.platform_bps) / 10000) : 0,
    transfer_destination: '',
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
  const amountCents = Number(session.amount_total || paymentRecord.amount || 0);
  const customerName = session.customer_details?.name || metadata.client_name || '';
  const customerEmail = session.customer_details?.email || session.customer_email || metadata.client_email || '';

  // Buyer gets a per-document read grant on their credit.
  const permissions = metadata.client_account_id
    ? [Permission.read(Role.user(metadata.client_account_id))]
    : [];
  const credit = await createDocumentSafe(db, 'session_credits', {
    client_email: customerEmail,
    client_name: customerName,
    client_profile_id: metadata.client_profile_id || '',
    package_id: metadata.package_id,
    package_name: metadata.package_name || 'Training sessions',
    coach_id: metadata.coach_id || '',
    total_credits: sessions,
    used_credits: 0,
    session_duration_minutes: duration,
    amount_cents: amountCents,
    per_session_base_price_cents: Math.floor(amountCents / sessions),
    per_session_base_price: Math.round((amountCents / 100) / sessions),
    payment_processor: 'stripe',
  }, permissions);
  return credit.$id;
}

async function ledgerEntryExists(db, paymentRecordId, type, stripeRef = '') {
  const queries = [
    Query.equal('payment_record_id', paymentRecordId),
    Query.equal('type', type),
  ];
  if (stripeRef) queries.push(Query.equal('stripe_ref', stripeRef));
  const row = await firstDocument(db, 'payment_ledger_entries', queries).catch(() => null);
  return !!row;
}

async function writeLedgerEntry(db, entry, permissions = []) {
  if (await ledgerEntryExists(db, entry.payment_record_id, entry.type, entry.stripe_ref || '')) return;
  await createDocumentSafe(db, 'payment_ledger_entries', entry, permissions);
}

// Separate charges & transfers: real Stripe transfers against the charge, one
// per payee leg. legCents = floor(amount*bps/10000); the platform keeps the
// rounding remainder. Idempotent per destination via stripe_transfer_records.
async function createTransfersForPayment(db, stripe, paymentRecord, plan, chargeId) {
  const amount = Number(paymentRecord.amount || 0);
  const currency = paymentRecord.currency || 'usd';
  if (!plan || !chargeId || amount <= 0) return [];

  const existingRows = await db.listDocuments(DB_ID, 'stripe_transfer_records', [
    Query.equal('payment_record_id', paymentRecord.$id),
    Query.limit(25),
  ]).catch(() => ({ documents: [] }));

  const legs = [
    { type: 'coach_payout', owner_type: 'coach', owner_id: plan.coach_id, bps: plan.coach_bps, destination: plan.coach_account_id },
    { type: 'org_payout', owner_type: 'org', owner_id: plan.organization_id, bps: plan.org_bps, destination: plan.org_account_id },
  ];

  const created = [];
  for (const leg of legs) {
    if (!(leg.bps > 0) || !leg.destination) continue;
    const legCents = Math.floor((amount * leg.bps) / 10000);
    if (legCents <= 0) continue;

    const existing = existingRows.documents.find((row) =>
      row.destination_account_id === leg.destination && row.transfer_id);
    if (existing) {
      created.push({ ...leg, amount: Number(existing.amount || legCents), transfer_id: existing.transfer_id });
      continue;
    }

    const transfer = await stripe.transfers.create({
      amount: legCents,
      currency,
      destination: leg.destination,
      source_transaction: chargeId,
      transfer_group: paymentRecord.$id,
      metadata: {
        payment_record_id: paymentRecord.$id,
        leg: leg.type,
        coach_id: plan.coach_id,
        organization_id: plan.organization_id,
      },
    });
    await db.createDocument(DB_ID, 'stripe_transfer_records', ID.unique(), {
      payment_record_id: paymentRecord.$id,
      destination_account_id: leg.destination,
      amount: legCents,
      status: 'paid',
      transfer_id: transfer.id,
    });
    created.push({ ...leg, amount: legCents, transfer_id: transfer.id });
  }
  return created;
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
    state: 'paid',
    webhook_processed_at: new Date().toISOString(),
    currency: session.currency || paymentIntent?.currency || paymentRecord.currency || 'usd',
  });

  const metadata = session.metadata || parseJson(updated.metadata);
  const plan = parsePayoutPlan(metadata);
  const transfers = await createTransfersForPayment(db, stripe, updated, plan, chargeId);

  // Ledger: append-only, one entry per leg (charge, platform_fee, payouts).
  const amount = Number(updated.amount || 0);
  const currency = updated.currency || 'usd';
  const clientReadGrant = metadata.client_account_id
    ? [Permission.read(Role.user(metadata.client_account_id))]
    : [];
  await writeLedgerEntry(db, {
    payment_record_id: updated.$id,
    type: 'charge',
    amount_cents: amount,
    currency,
    owner_type: 'client',
    owner_id: metadata.client_profile_id || '',
    stripe_ref: chargeId || updated.payment_intent_id || '',
    coach_id: metadata.coach_id || '',
    organization_id: plan?.organization_id || '',
    metadata: JSON.stringify({ checkout_session_id: session.id }),
  }, clientReadGrant);

  if (plan) {
    const coachLeg = transfers.find((leg) => leg.type === 'coach_payout');
    const orgLeg = transfers.find((leg) => leg.type === 'org_payout');
    const platformFee = amount - (coachLeg?.amount || 0) - (orgLeg?.amount || 0);
    await writeLedgerEntry(db, {
      payment_record_id: updated.$id,
      type: 'platform_fee',
      amount_cents: platformFee,
      currency,
      owner_type: 'platform',
      owner_id: '',
      stripe_ref: chargeId || '',
      coach_id: plan.coach_id,
      organization_id: plan.organization_id,
      metadata: JSON.stringify({ platform_bps: plan.platform_bps }),
    });
    if (coachLeg) {
      const coach = plan.coach_id
        ? await db.getDocument(DB_ID, 'coaches', plan.coach_id).catch(() => null)
        : null;
      await writeLedgerEntry(db, {
        payment_record_id: updated.$id,
        type: 'coach_payout',
        amount_cents: coachLeg.amount,
        currency,
        owner_type: 'coach',
        owner_id: plan.coach_id,
        stripe_ref: coachLeg.transfer_id,
        coach_id: plan.coach_id,
        organization_id: plan.organization_id,
        metadata: JSON.stringify({ coach_bps: plan.coach_bps }),
      }, coach?.user_id ? [Permission.read(Role.user(coach.user_id))] : []);
    }
    if (orgLeg) {
      await writeLedgerEntry(db, {
        payment_record_id: updated.$id,
        type: 'org_payout',
        amount_cents: orgLeg.amount,
        currency,
        owner_type: 'org',
        owner_id: plan.organization_id,
        stripe_ref: orgLeg.transfer_id,
        coach_id: plan.coach_id,
        organization_id: plan.organization_id,
        metadata: JSON.stringify({ org_bps: plan.org_bps }),
      });
    }
  }
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

async function freezeCredit(db, creditId) {
  if (!creditId) return;
  const credit = await db.getDocument(DB_ID, 'session_credits', creditId).catch(() => null);
  if (!credit) return;
  const total = Number(credit.total_credits || 0);
  const used = Number(credit.used_credits || 0);
  if (total > used) {
    await db.updateDocument(DB_ID, 'session_credits', credit.$id, { used_credits: total }).catch(() => {});
  }
}

function refundState(refundedAmount, totalAmount) {
  if (refundedAmount >= totalAmount && totalAmount > 0) return 'refunded';
  if (refundedAmount > 0) return 'partially_refunded';
  return 'paid';
}

// charge.refunded / refund.created / refund.updated. The charge's
// amount_refunded is the source of truth — refund objects are resolved to
// their charge first.
async function handleRefundLike(db, stripe, object) {
  let charge = null;
  if (object.object === 'charge') {
    charge = object;
  } else {
    const chargeId = typeof object.charge === 'string' ? object.charge : object.charge?.id || '';
    if (chargeId) charge = await stripe.charges.retrieve(chargeId).catch(() => null);
  }
  if (!charge) return false;

  const paymentIntentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id || '';
  const refundedAmount = Number(charge.amount_refunded || 0);
  const refundId = object.object === 'refund' ? object.id : '';
  const paymentRecord = await findPaymentRecord(db, { paymentIntentId, chargeId: charge.id });
  if (!paymentRecord) return false;

  const totalAmount = Number(paymentRecord.amount || 0);
  const state = refundState(refundedAmount, totalAmount);
  const fullRefund = state === 'refunded';
  await db.updateDocument(DB_ID, 'stripe_payment_records', paymentRecord.$id, {
    charge_id: charge.id || paymentRecord.charge_id || '',
    refund_id: refundId || paymentRecord.refund_id || '',
    refunded_amount: refundedAmount,
    // Legacy status enum has no partially_refunded: keep 'paid' until full.
    status: fullRefund ? 'refunded' : 'paid',
    state,
    webhook_processed_at: new Date().toISOString(),
  });
  if (fullRefund) await freezeCredit(db, paymentRecord.credit_id);
  await reverseTransfersForRefund(db, stripe, paymentRecord, refundedAmount, totalAmount);
  return true;
}

// Refunds can originate outside refundStripePayment (e.g. the Stripe
// Dashboard). Under separate charges & transfers the payouts have already
// left the platform, so every refund must claw back the proportional share
// from each transfer leg or the platform eats the coach/org cut. Cumulative
// targets are computed from the charge's amount_refunded and compared against
// Stripe's own amount_reversed per transfer, so this is idempotent across
// event retries AND never double-reverses refunds the admin function already
// handled.
async function reverseTransfersForRefund(db, stripe, paymentRecord, refundedAmount, totalAmount) {
  if (!(refundedAmount > 0) || !(totalAmount > 0)) return;
  const recordMeta = parseJson(paymentRecord.metadata);
  const plan = parsePayoutPlan(recordMeta);
  const rows = await db.listDocuments(DB_ID, 'stripe_transfer_records', [
    Query.equal('payment_record_id', paymentRecord.$id),
    Query.limit(25),
  ]).catch(() => ({ documents: [] }));

  for (const record of rows.documents) {
    if (!record.transfer_id) continue;
    const transfer = await stripe.transfers.retrieve(record.transfer_id).catch(() => null);
    if (!transfer) continue;
    const target = Math.floor((Number(transfer.amount || 0) * Math.min(refundedAmount, totalAmount)) / totalAmount);
    const alreadyReversed = Number(transfer.amount_reversed || 0);
    const delta = target - alreadyReversed;
    if (delta <= 0) continue;

    const reversal = await stripe.transfers.createReversal(record.transfer_id, {
      amount: delta,
      metadata: { payment_record_id: paymentRecord.$id, source: 'stripeWebhook.refund' },
    }, {
      // Unified deterministic key shared with refundStripePayment: keyed to the
      // transfer id + cumulative target so the same logical reversal dedupes in
      // Stripe regardless of which path (admin refund or webhook) fires first.
      idempotencyKey: `rev_${record.transfer_id}_${target}`,
    }).catch((err) => {
      console.error(`[stripeWebhook] reversal failed for ${record.transfer_id}: ${err?.message || err}`);
      return null;
    });
    if (!reversal) continue;

    const fullyReversed = target >= Number(transfer.amount || 0);
    await db.updateDocument(DB_ID, 'stripe_transfer_records', record.$id, {
      reversal_id: reversal.id,
      status: fullyReversed ? 'reversed' : record.status || 'paid',
    }).catch(() => {});
    const isOrgLeg = !!plan?.org_account_id && record.destination_account_id === plan.org_account_id;
    await writeLedgerEntry(db, {
      payment_record_id: paymentRecord.$id,
      type: 'transfer_reversal',
      amount_cents: -delta,
      currency: paymentRecord.currency || 'usd',
      owner_type: isOrgLeg ? 'org' : 'coach',
      owner_id: (isOrgLeg ? plan?.organization_id : plan?.coach_id) || '',
      stripe_ref: reversal.id,
      coach_id: plan?.coach_id || recordMeta.coach_id || '',
      organization_id: plan?.organization_id || '',
      metadata: JSON.stringify({ transfer_id: record.transfer_id, cumulative_target: target, source: 'webhook' }),
    });
  }
}

// Disputes: mark state, freeze the credit, write a ledger entry and notify the
// master admin (profiles.master_admin_locked).
async function handleDisputeCreated(db, stripe, dispute) {
  const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id || '';
  const paymentIntentId = typeof dispute.payment_intent === 'string' ? dispute.payment_intent : dispute.payment_intent?.id || '';
  const paymentRecord = await findPaymentRecord(db, { paymentIntentId, chargeId });
  if (!paymentRecord) return false;

  await db.updateDocument(DB_ID, 'stripe_payment_records', paymentRecord.$id, {
    state: 'disputed',
    webhook_processed_at: new Date().toISOString(),
  });
  await freezeCredit(db, paymentRecord.credit_id);

  const metadata = parseJson(paymentRecord.metadata);
  await writeLedgerEntry(db, {
    payment_record_id: paymentRecord.$id,
    type: 'dispute',
    amount_cents: Number(dispute.amount || 0),
    currency: dispute.currency || paymentRecord.currency || 'usd',
    owner_type: 'platform',
    owner_id: '',
    stripe_ref: dispute.id,
    coach_id: metadata.coach_id || '',
    organization_id: '',
    metadata: JSON.stringify({ reason: dispute.reason || '', dispute_status: dispute.status || '' }),
  });

  const masterAdmin = await firstDocument(db, 'profiles', [
    Query.equal('master_admin_locked', true),
  ]).catch(() => null);
  if (masterAdmin) {
    const permissions = masterAdmin.account_id
      ? [
        Permission.read(Role.user(masterAdmin.account_id)),
        Permission.update(Role.user(masterAdmin.account_id)),
      ]
      : [];
    await createDocumentSafe(db, 'notifications', {
      recipient_profile_id: masterAdmin.$id,
      recipient_account_id: masterAdmin.account_id || '',
      type: 'payment_dispute',
      title: 'Stripe payment disputed',
      body: `A payment of ${Number(dispute.amount || 0)} cents was disputed (${dispute.reason || 'unknown reason'}).`,
      data: JSON.stringify({ payment_record_id: paymentRecord.$id, dispute_id: dispute.id, charge_id: chargeId }),
      read: false,
    }, permissions).catch(() => {});
  }
  return true;
}

async function handleDisputeClosed(db, dispute) {
  const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id || '';
  const paymentIntentId = typeof dispute.payment_intent === 'string' ? dispute.payment_intent : dispute.payment_intent?.id || '';
  const paymentRecord = await findPaymentRecord(db, { paymentIntentId, chargeId });
  if (!paymentRecord) return false;

  await db.updateDocument(DB_ID, 'stripe_payment_records', paymentRecord.$id, {
    // Dispute won: back to paid (refund state still wins if money left).
    ...(dispute.status === 'won'
      ? { state: refundState(Number(paymentRecord.refunded_amount || 0), Number(paymentRecord.amount || 0)) }
      : {}),
    webhook_processed_at: new Date().toISOString(),
  });
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
      handled = await handleRefundLike(db, stripe, object);
    } else if (event.type === 'charge.dispute.created') {
      handled = await handleDisputeCreated(db, stripe, object);
    } else if (event.type === 'charge.dispute.closed') {
      handled = await handleDisputeClosed(db, object);
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
      error: String(err?.message || err).slice(0, 2000),
    }).catch(() => {});
    return res.json({ error: 'Stripe webhook processing failed.' }, 500);
  }
};
