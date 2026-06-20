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

function cents(value, fallback = 0) {
  const n = Number(value);
  return Number.isInteger(n) ? n : fallback;
}

function payoutPlanSnapshot(metadata) {
  const legacyPlan = parsePayoutPlan(metadata);
  if (legacyPlan) {
    return {
      ...legacyPlan,
      release_trigger: 'session_outcome',
      source: 'checkout_metadata',
    };
  }
  return {
    release_trigger: 'session_outcome',
    source: 'deferred_booking_snapshot',
    status: 'deferred',
    original_coach_id: String(metadata.coach_id || ''),
    original_organization_id: String(metadata.originating_organization_id || metadata.organization_id || ''),
    note: 'Transferable credit: final payout split is server-validated when the credit is reserved for a session.',
  };
}

function paymentMetadataSnapshot(session, paymentIntent = null, paymentRecord = null) {
  const metadata = {
    ...parseJson(paymentRecord?.metadata),
    ...parseJson(paymentIntent?.metadata),
    ...parseJson(session?.metadata),
  };
  metadata.payout_plan = payoutPlanSnapshot(metadata);
  return metadata;
}

function ownerReadGrant(metadata) {
  return metadata.client_account_id
    ? [Permission.read(Role.user(metadata.client_account_id))]
    : [];
}

async function coachReadGrant(db, coachId) {
  if (!coachId) return [];
  const coach = await db.getDocument(DB_ID, 'coaches', coachId).catch(() => null);
  return coach?.user_id ? [Permission.read(Role.user(coach.user_id))] : [];
}

async function creditReadGrants(db, metadata) {
  return [...new Set([
    ...ownerReadGrant(metadata),
    ...(await coachReadGrant(db, metadata.coach_id || metadata.original_coach_id || metadata.originating_coach_id || '')),
  ])];
}

function deterministicCreditId(paymentRecord) {
  const base = String(paymentRecord?.$id || '').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 28);
  return base ? `credit_${base}` : ID.unique();
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

async function createDocumentWithIdSafe(db, collection, id, data, permissions = []) {
  if (permissions.length > 0) {
    try {
      return await db.createDocument(DB_ID, collection, id, data, permissions);
    } catch (err) {
      if (err?.code === 409) throw err;
      return db.createDocument(DB_ID, collection, id, data);
    }
  }
  return db.createDocument(DB_ID, collection, id, data);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatCents(amountCents, currency = 'usd') {
  const amount = Number(amountCents);
  if (!Number.isFinite(amount)) return '';
  return (amount / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: String(currency || 'usd').toUpperCase(),
  });
}

function appBaseUrl() {
  return String(process.env.APP_BASE_URL || 'https://lctrainings.com').replace(/\/+$/, '');
}

function schedulePath(metadata, creditId) {
  const params = new URLSearchParams();
  if (metadata.coach_id) params.set('coach_id', metadata.coach_id);
  if (creditId) params.set('credit_id', creditId);
  const qs = params.toString();
  return qs ? `/book?${qs}` : '/dashboard';
}

async function profileForAccount(db, accountId) {
  if (!accountId) return null;
  return firstDocument(db, 'profiles', [Query.equal('account_id', accountId)]).catch(() => null);
}

async function coachPrivateEmail(db, coachId) {
  if (!coachId) return '';
  const coachPriv = await firstDocument(db, 'coach_private', [Query.equal('coach_id', coachId)]).catch(() => null);
  return coachPriv?.email || '';
}

async function notifyProfile(db, { profileId, accountId = '', type, title, body, link = '', data = {} }) {
  if (!profileId) return;
  const permissions = accountId
    ? [
      Permission.read(Role.user(accountId)),
      Permission.update(Role.user(accountId)),
    ]
    : [];
  await createDocumentSafe(db, 'notifications', {
    recipient_profile_id: profileId,
    recipient_account_id: accountId,
    type,
    title: String(title || '').slice(0, 200),
    body: String(body || '').slice(0, 2000),
    link: String(link || '').slice(0, 500),
    read: false,
    data: JSON.stringify(data).slice(0, 2000),
  }, permissions).catch(() => {});
}

async function sendEmail({ to, subject, html }, error) {
  try {
    if (!process.env.RESEND_API_KEY || !to) return;
    const from = process.env.EMAIL_FROM || 'LevelCoach Training <support@lctrainings.com>';
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.message || `Resend returned ${response.status}`);
    }
  } catch (err) {
    error?.(`[stripeWebhook] email send failed: ${err?.message || err}`);
  }
}

async function sendPurchaseNotifications(db, session, paymentRecord, metadata, { creditId, amount, currency, isTopUp, error }) {
  const link = schedulePath(metadata, creditId);
  const fullLink = `${appBaseUrl()}${link}`;
  const clientName = session.customer_details?.name || metadata.client_name || 'there';
  const clientEmail = session.customer_details?.email || session.customer_email || metadata.client_email || '';
  const coach = metadata.coach_id
    ? await db.getDocument(DB_ID, 'coaches', metadata.coach_id).catch(() => null)
    : null;
  const coachName = metadata.coach_name
    || [coach?.first_name, coach?.last_name].filter(Boolean).join(' ').trim()
    || 'your coach';
  const packageName = metadata.package_name || 'Training credit';
  const amountLabel = formatCents(amount, currency);
  const actionLabel = isTopUp ? 'top-up' : 'training credit';

  await notifyProfile(db, {
    profileId: metadata.client_profile_id || '',
    accountId: metadata.client_account_id || '',
    type: 'payment_receipt',
    title: 'Payment received',
    body: `${amountLabel} ${actionLabel} for ${packageName} is ready. You can schedule with ${coachName} or apply the balance to another published coach.`,
    link,
    data: {
      payment_record_id: paymentRecord.$id,
      checkout_session_id: session.id,
      credit_id: creditId || '',
      coach_id: metadata.coach_id || '',
    },
  });

  await sendEmail({
    to: clientEmail,
    subject: `LevelCoach receipt — ${amountLabel} ${packageName}`,
    html: `
      <p>Hi ${escapeHtml(clientName || 'there')},</p>
      <p>We received your ${escapeHtml(amountLabel)} payment for <strong>${escapeHtml(packageName)}</strong>.</p>
      <p>Your prepaid LevelCoach credit is ready. You can schedule with <strong>${escapeHtml(coachName)}</strong> or apply the remaining balance toward another published coach.</p>
      <p><a href="${escapeHtml(fullLink)}">Schedule your session</a></p>
      <p>Card details are handled by Stripe; LevelCoach never stores your card number.</p>
    `,
  }, error);

  if (!coach) return;
  const coachAccountId = coach.user_id || coach.account_id || '';
  const coachProfile = await profileForAccount(db, coachAccountId);
  await notifyProfile(db, {
    profileId: coachProfile?.$id || '',
    accountId: coachAccountId,
    type: 'credit_purchased',
    title: 'New prepaid training credit',
    body: `${clientName || 'An athlete'} purchased ${packageName} from your profile. No session is booked yet, and unused LevelCoach credit can be applied to another published coach before scheduling.`,
    link: '/coach/sessions',
    data: {
      payment_record_id: paymentRecord.$id,
      checkout_session_id: session.id,
      credit_id: creditId || '',
      coach_id: coach.$id,
      client_profile_id: metadata.client_profile_id || '',
    },
  });

  const coachEmail = await coachPrivateEmail(db, coach.$id);
  await sendEmail({
    to: coachEmail,
    subject: 'LevelCoach credit purchased',
    html: `
      <p>Hi ${escapeHtml(coach.first_name || 'Coach')},</p>
      <p><strong>${escapeHtml(clientName || 'An athlete')}</strong> purchased <strong>${escapeHtml(packageName)}</strong>.</p>
      <p>No session is on your calendar yet. You will receive a separate confirmation if they schedule a date and time with you.</p>
      <p>LevelCoach credits are transferable by remaining dollar value until they are reserved for a specific session.</p>
    `,
  }, error);
}

async function ensurePaymentRecord(db, session, paymentIntent) {
  const paymentIntentId = typeof session.payment_intent === 'string'
    ? session.payment_intent
    : session.payment_intent?.id || '';
  const metadata = paymentMetadataSnapshot(session, paymentIntent);
  let paymentRecord = await findPaymentRecord(db, {
    checkoutSessionId: session.id,
    paymentIntentId,
  });
  if (paymentRecord) return paymentRecord;

  const amount = Number(session.amount_total || paymentIntent?.amount || 0);
  return db.createDocument(DB_ID, 'stripe_payment_records', ID.unique(), {
    booking_id: metadata.booking_id || session.client_reference_id || '',
    checkout_session_id: session.id,
    payment_intent_id: paymentIntentId,
    charge_id: typeof paymentIntent?.latest_charge === 'string' ? paymentIntent.latest_charge : paymentIntent?.latest_charge?.id || '',
    amount,
    application_fee: 0,
    transfer_destination: '',
    status: 'created',
    state: 'created',
    purpose: metadata.purpose || 'prepaid_credit',
    merchant_of_record: 'levelcoach_platform',
    athlete_id: metadata.athlete_id || '',
    available_for_refund_cents: amount,
    disputed_amount_cents: 0,
    metadata: JSON.stringify(metadata),
    currency: session.currency || paymentIntent?.currency || 'usd',
  }, ownerReadGrant(metadata));
}

async function createCreditIfMissing(db, paymentRecord, session, metadata) {
  if (paymentRecord.credit_lot_id || paymentRecord.credit_id) return paymentRecord.credit_lot_id || paymentRecord.credit_id;
  if (!metadata.package_id) return '';
  const creditDocId = deterministicCreditId(paymentRecord);
  const existingById = await db.getDocument(DB_ID, 'session_credits', creditDocId).catch(() => null);
  if (existingById) return existingById.$id;
  const existingBySource = await firstDocument(db, 'session_credits', [
    Query.equal('source_payment_record_id', paymentRecord.$id),
  ]).catch(() => null);
  if (existingBySource) return existingBySource.$id;

  const sessions = Number.parseInt(metadata.package_sessions || '1', 10) || 1;
  const duration = Number.parseInt(metadata.session_duration_minutes || '60', 10) || 60;
  const amountCents = Number(session.amount_total || paymentRecord.amount || 0);
  const customerName = session.customer_details?.name || metadata.client_name || '';
  const customerEmail = session.customer_details?.email || session.customer_email || metadata.client_email || '';

  // Buyer and the original coach get per-document read grants on the credit.
  const permissions = await creditReadGrants(db, metadata);
  const creditData = {
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
    owner_profile_id: metadata.client_profile_id || '',
    owner_account_id: metadata.client_account_id || '',
    athlete_id: metadata.athlete_id || '',
    currency: session.currency || paymentRecord.currency || 'usd',
    original_amount_cents: amountCents,
    remaining_amount_cents: amountCents,
    available_amount_cents: amountCents,
    reserved_amount_cents: 0,
    spent_amount_cents: 0,
    refunded_amount_cents: 0,
    earned_amount_cents: 0,
    original_coach_id: metadata.coach_id || '',
    original_organization_id: metadata.originating_organization_id || '',
    originating_coach_id: metadata.coach_id || '',
    originating_organization_id: metadata.originating_organization_id || '',
    source_payment_record_id: paymentRecord.$id,
    transferable: true,
    status: 'active',
  };
  const credit = await createDocumentWithIdSafe(db, 'session_credits', creditDocId, creditData, permissions)
    .catch(async (err) => {
      if (err?.code !== 409) throw err;
      return db.getDocument(DB_ID, 'session_credits', creditDocId);
    });
  return credit.$id;
}

async function applyCreditTopUpIfMissing(db, paymentRecord, session, metadata) {
  const creditId = String(metadata.top_up_credit_id || metadata.credit_id || '').trim();
  if (!creditId) return '';
  if (paymentRecord.credit_lot_id || paymentRecord.credit_id) return paymentRecord.credit_lot_id || paymentRecord.credit_id;

  const idempotencyKey = `credit_top_up_${paymentRecord.$id}`;
  if (await creditLedgerEntryExists(db, idempotencyKey)) return creditId;

  const credit = await db.getDocument(DB_ID, 'session_credits', creditId).catch(() => null);
  if (!credit) return '';
  const amountCents = Number(session.amount_total || paymentRecord.amount || 0);
  if (!Number.isInteger(amountCents) || amountCents <= 0) return credit.$id;

  await db.incrementDocumentAttribute(DB_ID, 'session_credits', credit.$id, 'remaining_amount_cents', amountCents);
  await db.incrementDocumentAttribute(DB_ID, 'session_credits', credit.$id, 'available_amount_cents', amountCents).catch(() => {});
  await db.incrementDocumentAttribute(DB_ID, 'session_credits', credit.$id, 'original_amount_cents', amountCents).catch(() => {});
  await db.incrementDocumentAttribute(DB_ID, 'session_credits', credit.$id, 'amount_cents', amountCents).catch(() => {});
  if (credit.status === 'exhausted' || credit.status === 'expired') {
    await db.updateDocument(DB_ID, 'session_credits', credit.$id, { status: 'active' }).catch(() => {});
  }

  const permissions = ownerReadGrant(metadata);
  await writeCreditLedgerEntry(db, {
    credit_id: credit.$id,
    credit_lot_id: credit.$id,
    client_profile_id: metadata.client_profile_id || credit.client_profile_id || credit.owner_profile_id || '',
    owner_profile_id: metadata.client_profile_id || credit.owner_profile_id || credit.client_profile_id || '',
    athlete_id: metadata.athlete_id || credit.athlete_id || '',
    payment_record_id: paymentRecord.$id,
    session_id: '',
    actor_profile_id: metadata.client_profile_id || '',
    type: 'top_up',
    amount_cents: amountCents,
    available_delta_cents: amountCents,
    reserved_delta_cents: 0,
    currency: session.currency || paymentRecord.currency || credit.currency || 'usd',
    from_coach_id: credit.original_coach_id || credit.coach_id || '',
    to_coach_id: metadata.coach_id || '',
    organization_id: metadata.originating_organization_id || credit.original_organization_id || '',
    idempotency_key: idempotencyKey,
    metadata: JSON.stringify({
      checkout_session_id: session.id,
      session_price_cents: metadata.top_up_session_price_cents || '',
      previous_remaining_cents: metadata.top_up_previous_remaining_cents || '',
    }),
  }, permissions);
  return credit.$id;
}

async function ledgerEntryExists(db, paymentRecordId, type, stripeRef = '', idempotencyKey = '') {
  if (idempotencyKey) {
    const row = await firstDocument(db, 'payment_ledger_entries', [
      Query.equal('idempotency_key', idempotencyKey),
    ]).catch(() => null);
    if (row) return true;
  }
  const queries = [
    Query.equal('payment_record_id', paymentRecordId),
    Query.equal('type', type),
  ];
  if (stripeRef) queries.push(Query.equal('stripe_ref', stripeRef));
  const row = await firstDocument(db, 'payment_ledger_entries', queries).catch(() => null);
  return !!row;
}

async function writeLedgerEntry(db, entry, permissions = []) {
  if (await ledgerEntryExists(db, entry.payment_record_id, entry.type, entry.stripe_ref || '', entry.idempotency_key || '')) return;
  await createDocumentSafe(db, 'payment_ledger_entries', entry, permissions);
}

async function creditLedgerEntryExists(db, idempotencyKey) {
  if (!idempotencyKey) return false;
  const row = await firstDocument(db, 'credit_ledger_entries', [
    Query.equal('idempotency_key', idempotencyKey),
  ]).catch(() => null);
  return !!row;
}

async function writeCreditLedgerEntry(db, entry, permissions = []) {
  if (await creditLedgerEntryExists(db, entry.idempotency_key || '')) return;
  await createDocumentSafe(db, 'credit_ledger_entries', entry, permissions);
}

async function writeAudit(db, entry) {
  const data = { ...entry, actor_email: entry.actor_email || 'stripe-webhook@levelcoach.com' };
  if (!['admin', 'super_admin'].includes(data.actor_role)) delete data.actor_role;
  await db.createDocument(DB_ID, 'audit_logs', ID.unique(), data).catch(() => {});
}

async function handleCheckoutCompleted(db, stripe, session, error) {
  const paymentIntentId = typeof session.payment_intent === 'string'
    ? session.payment_intent
    : session.payment_intent?.id || '';
  const paymentIntent = paymentIntentId
    ? await stripe.paymentIntents.retrieve(paymentIntentId).catch(() => null)
    : null;
  const paymentRecord = await ensurePaymentRecord(db, session, paymentIntent);
  const metadata = paymentMetadataSnapshot(session, paymentIntent, paymentRecord);
  const isTopUp = metadata.purpose === 'credit_top_up' || !!metadata.top_up_credit_id;
  const creditId = isTopUp
    ? await applyCreditTopUpIfMissing(db, paymentRecord, session, metadata)
    : await createCreditIfMissing(db, paymentRecord, session, metadata);
  const chargeId = typeof paymentIntent?.latest_charge === 'string' ? paymentIntent.latest_charge : paymentIntent?.latest_charge?.id || '';
  const amount = Number(session.amount_total || paymentIntent?.amount || paymentRecord.amount || 0);
  const currency = session.currency || paymentIntent?.currency || paymentRecord.currency || 'usd';
  const refundedAmount = Number(paymentRecord.refunded_amount || 0);

  const updated = await db.updateDocument(DB_ID, 'stripe_payment_records', paymentRecord.$id, {
    credit_id: creditId || paymentRecord.credit_id || '',
    credit_lot_id: creditId || paymentRecord.credit_lot_id || paymentRecord.credit_id || '',
    payment_intent_id: paymentIntentId || paymentRecord.payment_intent_id || '',
    charge_id: chargeId || paymentRecord.charge_id || '',
    amount,
    application_fee: 0,
    transfer_destination: '',
    status: 'paid',
    state: 'paid',
    purpose: metadata.purpose || paymentRecord.purpose || 'prepaid_credit',
    merchant_of_record: 'levelcoach_platform',
    athlete_id: metadata.athlete_id || paymentRecord.athlete_id || '',
    available_for_refund_cents: Math.max(0, amount - refundedAmount),
    disputed_amount_cents: Number(paymentRecord.disputed_amount_cents || 0),
    metadata: JSON.stringify(metadata),
    webhook_processed_at: new Date().toISOString(),
    currency,
  }, ownerReadGrant(metadata));

  // Ledger: checkout records only the platform charge and purchased credit.
  // Coach/org payout ledgers are written after an earned session outcome.
  const clientReadGrant = ownerReadGrant(metadata);
  await writeLedgerEntry(db, {
    payment_record_id: updated.$id,
    type: 'charge',
    amount_cents: amount,
    currency,
    owner_type: 'client',
    owner_id: metadata.client_profile_id || '',
    stripe_ref: chargeId || updated.payment_intent_id || '',
    coach_id: metadata.coach_id || '',
    organization_id: metadata.originating_organization_id || '',
    credit_lot_id: creditId || '',
    idempotency_key: `charge_${updated.$id}`,
    metadata: JSON.stringify({ checkout_session_id: session.id, payout_plan: metadata.payout_plan }),
  }, clientReadGrant);

  if (creditId && !isTopUp) {
    await writeCreditLedgerEntry(db, {
      credit_id: creditId,
      credit_lot_id: creditId,
      client_profile_id: metadata.client_profile_id || '',
      owner_profile_id: metadata.client_profile_id || '',
      athlete_id: metadata.athlete_id || '',
      payment_record_id: updated.$id,
      type: 'purchase',
      amount_cents: amount,
      available_delta_cents: amount,
      reserved_delta_cents: 0,
      currency,
      idempotency_key: `credit_checkout_${updated.$id}`,
      metadata: JSON.stringify({ checkout_session_id: session.id }),
    }, clientReadGrant);
  }

  await sendPurchaseNotifications(db, session, updated, metadata, {
    creditId,
    amount,
    currency,
    isTopUp,
    error,
  }).catch((err) => {
    error?.(`[stripeWebhook] purchase notification failed: ${err?.message || err}`);
  });
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

function creditUnusedUnreservedCents(credit) {
  const remaining = cents(credit?.remaining_amount_cents, NaN);
  if (Number.isInteger(remaining) && remaining >= 0) return remaining;
  const available = cents(credit?.available_amount_cents, NaN);
  if (Number.isInteger(available) && available >= 0) return available;

  const total = Number(credit?.total_credits || 0);
  const used = Number(credit?.used_credits || 0);
  const perSession = cents(credit?.per_session_base_price_cents, 0);
  if (total > used && perSession > 0) return Math.max(0, total - used) * perSession;
  return 0;
}

function creditStatusAfterRefund(credit, remainingAfter, fullRefund) {
  const reserved = cents(credit?.reserved_amount_cents, 0);
  const spent = cents(credit?.spent_amount_cents, 0) || cents(credit?.earned_amount_cents, 0);
  if (fullRefund && reserved > 0) return 'frozen';
  if (fullRefund && reserved <= 0 && spent <= 0) return 'refunded';
  if (fullRefund) return 'exhausted';
  if (remainingAfter > 0) return credit?.status || 'active';
  if (reserved <= 0) return 'exhausted';
  return 'frozen';
}

async function applyUnusedCreditRefund(db, paymentRecord, cumulativeRefundedAmount, refundRef, fullRefund) {
  const creditId = paymentRecord.credit_lot_id || paymentRecord.credit_id;
  if (!creditId) return { debit: 0, cumulative_credit_refunded: 0 };
  const credit = await db.getDocument(DB_ID, 'session_credits', creditId).catch(() => null);
  if (!credit) return { debit: 0, cumulative_credit_refunded: 0 };

  const alreadyRefunded = cents(credit.refunded_amount_cents, 0);
  const refundableNow = creditUnusedUnreservedCents(credit);
  const targetRefunded = Math.min(Math.max(0, cumulativeRefundedAmount), alreadyRefunded + refundableNow);
  const debit = Math.max(0, targetRefunded - alreadyRefunded);
  if (debit <= 0) {
    if (fullRefund) {
      await db.updateDocument(DB_ID, 'session_credits', credit.$id, {
        status: creditStatusAfterRefund(credit, refundableNow, true),
      }).catch(() => {});
    }
    return { debit: 0, cumulative_credit_refunded: alreadyRefunded };
  }

  const metadata = parseJson(paymentRecord.metadata);
  const permissions = ownerReadGrant(metadata);
  await writeCreditLedgerEntry(db, {
    credit_id: credit.$id,
    credit_lot_id: credit.$id,
    payment_record_id: paymentRecord.$id,
    client_profile_id: metadata.client_profile_id || credit.client_profile_id || credit.owner_profile_id || '',
    owner_profile_id: metadata.client_profile_id || credit.owner_profile_id || credit.client_profile_id || '',
    athlete_id: metadata.athlete_id || credit.athlete_id || '',
    type: 'refund',
    amount_cents: debit,
    available_delta_cents: -debit,
    reserved_delta_cents: 0,
    currency: paymentRecord.currency || credit.currency || 'usd',
    from_coach_id: credit.original_coach_id || credit.coach_id || '',
    organization_id: credit.original_organization_id || credit.originating_organization_id || '',
    idempotency_key: `credit_refund_${paymentRecord.$id}_${targetRefunded}`,
    metadata: JSON.stringify({ refund_ref: refundRef || '', cumulative_refunded_amount: cumulativeRefundedAmount }),
  }, permissions);

  const remainingAfter = Math.max(0, refundableNow - debit);
  const update = {
    remaining_amount_cents: remainingAfter,
    refunded_amount_cents: targetRefunded,
    status: creditStatusAfterRefund(credit, remainingAfter, fullRefund),
  };
  if (credit.available_amount_cents !== undefined) {
    update.available_amount_cents = remainingAfter;
  }
  await db.updateDocument(DB_ID, 'session_credits', credit.$id, update);
  return { debit, cumulative_credit_refunded: targetRefunded };
}

async function freezeUnusedCredit(db, paymentRecord, disputedAmount, disputeRef) {
  const creditId = paymentRecord.credit_lot_id || paymentRecord.credit_id;
  if (!creditId) return 0;
  const credit = await db.getDocument(DB_ID, 'session_credits', creditId).catch(() => null);
  if (!credit) return 0;
  const freezeAmount = Math.min(Math.max(0, cents(disputedAmount, 0)), creditUnusedUnreservedCents(credit));

  const metadata = parseJson(paymentRecord.metadata);
  const permissions = ownerReadGrant(metadata);
  await writeCreditLedgerEntry(db, {
    credit_id: credit.$id,
    credit_lot_id: credit.$id,
    payment_record_id: paymentRecord.$id,
    client_profile_id: metadata.client_profile_id || credit.client_profile_id || credit.owner_profile_id || '',
    owner_profile_id: metadata.client_profile_id || credit.owner_profile_id || credit.client_profile_id || '',
    athlete_id: metadata.athlete_id || credit.athlete_id || '',
    type: 'dispute_freeze',
    amount_cents: freezeAmount,
    available_delta_cents: 0,
    reserved_delta_cents: 0,
    currency: paymentRecord.currency || credit.currency || 'usd',
    from_coach_id: credit.original_coach_id || credit.coach_id || '',
    organization_id: credit.original_organization_id || credit.originating_organization_id || '',
    idempotency_key: `credit_dispute_freeze_${paymentRecord.$id}_${disputeRef || disputedAmount}`,
    metadata: JSON.stringify({
      dispute_id: disputeRef || '',
      disputed_amount_cents: disputedAmount,
      previous_credit_status: credit.status || 'active',
      freeze_amount_cents: freezeAmount,
    }),
  }, permissions);

  await db.updateDocument(DB_ID, 'session_credits', credit.$id, {
    status: 'frozen',
  });
  return freezeAmount;
}

async function previousCreditStatusFromDisputeFreeze(db, paymentRecord, disputeId) {
  const rows = await db.listDocuments(DB_ID, 'credit_ledger_entries', [
    Query.equal('payment_record_id', paymentRecord.$id),
    Query.equal('type', 'dispute_freeze'),
    Query.orderDesc('$createdAt'),
    Query.limit(10),
  ]).catch(() => ({ documents: [] }));
  for (const row of rows.documents) {
    const metadata = parseJson(row.metadata);
    if (!disputeId || metadata.dispute_id === disputeId) {
      return String(metadata.previous_credit_status || '');
    }
  }
  return '';
}

async function unfreezeCreditIfDisputeWon(db, paymentRecord, disputeId) {
  const creditId = paymentRecord.credit_lot_id || paymentRecord.credit_id;
  if (!creditId) return;
  const credit = await db.getDocument(DB_ID, 'session_credits', creditId).catch(() => null);
  if (!credit || credit.status !== 'frozen') return;
  const previousStatus = await previousCreditStatusFromDisputeFreeze(db, paymentRecord, disputeId);
  if (previousStatus === 'frozen') return;
  if (previousStatus && previousStatus !== 'active') {
    await db.updateDocument(DB_ID, 'session_credits', credit.$id, {
      status: previousStatus,
    }).catch(() => {});
    return;
  }
  await db.updateDocument(DB_ID, 'session_credits', credit.$id, {
    status: creditUnusedUnreservedCents(credit) > 0 || cents(credit.reserved_amount_cents, 0) > 0 ? 'active' : 'exhausted',
  }).catch(() => {});
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
  const previouslyRefunded = Number(paymentRecord.refunded_amount || 0);
  const refundDelta = Math.max(0, refundedAmount - previouslyRefunded);
  const state = refundState(refundedAmount, totalAmount);
  const fullRefund = state === 'refunded';
  const creditRefund = refundedAmount > 0
    ? await applyUnusedCreditRefund(db, paymentRecord, refundedAmount, refundId || charge.id, fullRefund)
    : { debit: 0, cumulative_credit_refunded: 0 };
  const releasedRefundedAmount = Math.max(0, refundedAmount - creditRefund.cumulative_credit_refunded);
  if (refundDelta > 0) {
    const metadata = parseJson(paymentRecord.metadata);
    const permissions = ownerReadGrant(metadata);
    await writeLedgerEntry(db, {
      payment_record_id: paymentRecord.$id,
      type: 'refund',
      amount_cents: refundDelta,
      currency: charge.currency || paymentRecord.currency || 'usd',
      owner_type: 'client',
      owner_id: metadata.client_profile_id || '',
      stripe_ref: refundId || charge.id,
      coach_id: metadata.coach_id || '',
      organization_id: metadata.originating_organization_id || '',
      credit_lot_id: paymentRecord.credit_lot_id || paymentRecord.credit_id || '',
      idempotency_key: refundId ? `ledger_refund_${refundId}` : `ledger_refund_${paymentRecord.$id}_${refundedAmount}`,
      metadata: JSON.stringify({
        charge_id: charge.id,
        refund_delta_cents: refundDelta,
        unused_credit_debit_cents: creditRefund.debit,
        released_transfer_refund_cents: Math.max(0, refundDelta - creditRefund.debit),
      }),
    }, permissions);
  }
  await db.updateDocument(DB_ID, 'stripe_payment_records', paymentRecord.$id, {
    charge_id: charge.id || paymentRecord.charge_id || '',
    refund_id: refundId || paymentRecord.refund_id || '',
    refunded_amount: refundedAmount,
    available_for_refund_cents: Math.max(0, totalAmount - refundedAmount),
    // Legacy status enum has no partially_refunded: keep 'paid' until full.
    status: fullRefund ? 'refunded' : 'paid',
    state,
    webhook_processed_at: new Date().toISOString(),
  });
  await reverseTransfersForRefund(db, stripe, paymentRecord, releasedRefundedAmount, totalAmount);
  await writeAudit(db, {
    action: 'stripe.webhook_refund',
    entity_type: 'StripePaymentRecord',
    entity_id: paymentRecord.$id,
    before: JSON.stringify({ refunded_amount: previouslyRefunded, state: paymentRecord.state || '' }),
    after: JSON.stringify({ refunded_amount: refundedAmount, state }),
    metadata: JSON.stringify({
      charge_id: charge.id,
      refund_id: refundId || '',
      refund_delta_cents: refundDelta,
      unused_credit_debit_cents: creditRefund.debit,
      released_transfer_refund_cents: Math.max(0, refundDelta - creditRefund.debit),
    }),
  });
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
    await writeLedgerEntry(db, {
      payment_record_id: paymentRecord.$id,
      type: 'transfer_reversal',
      amount_cents: delta,
      currency: paymentRecord.currency || 'usd',
      owner_type: record.owner_type || 'coach',
      owner_id: record.owner_id || '',
      stripe_ref: reversal.id,
      coach_id: record.owner_type === 'coach' ? record.owner_id || '' : '',
      organization_id: record.owner_type === 'org' ? record.owner_id || '' : '',
      session_id: record.session_id || '',
      credit_lot_id: paymentRecord.credit_lot_id || paymentRecord.credit_id || '',
      credit_reservation_id: record.credit_reservation_id || '',
      idempotency_key: `ledger_transfer_reversal_${reversal.id}`,
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

  const frozenCreditCents = await freezeUnusedCredit(db, paymentRecord, Number(dispute.amount || 0), dispute.id);
  await db.updateDocument(DB_ID, 'stripe_payment_records', paymentRecord.$id, {
    state: 'disputed',
    disputed_amount_cents: frozenCreditCents,
    webhook_processed_at: new Date().toISOString(),
  });
  await writeAudit(db, {
    action: 'stripe.dispute_created',
    entity_type: 'StripePaymentRecord',
    entity_id: paymentRecord.$id,
    before: JSON.stringify({ state: paymentRecord.state || '', disputed_amount_cents: paymentRecord.disputed_amount_cents || 0 }),
    after: JSON.stringify({ state: 'disputed', disputed_amount_cents: frozenCreditCents }),
    metadata: JSON.stringify({ dispute_id: dispute.id, charge_id: chargeId, reason: dispute.reason || '' }),
  });

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
    idempotency_key: `ledger_dispute_${dispute.id}`,
    metadata: JSON.stringify({
      reason: dispute.reason || '',
      dispute_status: dispute.status || '',
      frozen_unused_credit_cents: frozenCreditCents,
    }),
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
  if (dispute.status === 'won') {
    await unfreezeCreditIfDisputeWon(db, paymentRecord, dispute.id);
  }

  const update = {
    // Dispute won: back to paid (refund state still wins if money left).
    ...(dispute.status === 'won'
      ? {
        state: refundState(Number(paymentRecord.refunded_amount || 0), Number(paymentRecord.amount || 0)),
        disputed_amount_cents: 0,
      }
      : {}),
    webhook_processed_at: new Date().toISOString(),
  };
  await db.updateDocument(DB_ID, 'stripe_payment_records', paymentRecord.$id, update);
  await writeAudit(db, {
    action: 'stripe.dispute_closed',
    entity_type: 'StripePaymentRecord',
    entity_id: paymentRecord.$id,
    before: JSON.stringify({ state: paymentRecord.state || '', disputed_amount_cents: paymentRecord.disputed_amount_cents || 0 }),
    after: JSON.stringify({ dispute_status: dispute.status || '', ...update }),
    metadata: JSON.stringify({ dispute_id: dispute.id, charge_id: chargeId }),
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
      await handleCheckoutCompleted(db, stripe, object, error);
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
