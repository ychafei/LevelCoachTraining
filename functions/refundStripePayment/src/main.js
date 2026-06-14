import { Client, Databases, ID, Permission, Query, Role, Users } from 'node-appwrite';
import Stripe from 'stripe';

const DB_ID = process.env.APPWRITE_DATABASE_ID || 'lctraining';
const STRIPE_API_VERSION = process.env.STRIPE_API_VERSION || '2026-02-25.clover';

function services() {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://nyc.cloud.appwrite.io/v1')
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);
  return { databases: new Databases(client), users: new Users(client) };
}

function body(req) {
  if (req.bodyJson && typeof req.bodyJson === 'object') return req.bodyJson;
  try { return JSON.parse(req.bodyRaw || req.body || '{}'); } catch { return {}; }
}

function header(req, names) {
  for (const name of names) {
    const value = req.headers?.[name] || req.headers?.[name.toLowerCase()] || req.headers?.[name.toUpperCase()];
    if (value) return String(value);
  }
  return '';
}

function callerAccountId(req) {
  return header(req, ['x-appwrite-user-id', 'X-Appwrite-User-Id', 'X-Appwrite-User-ID']);
}

async function profileForAccount(databases, accountId) {
  const rows = await databases.listDocuments(DB_ID, 'profiles', [
    Query.equal('account_id', accountId),
    Query.limit(1),
  ]);
  return rows.documents[0] || null;
}

// Banned callers are rejected even with an admin label.
async function callerBanned(databases, profile) {
  if (!profile?.email) return false;
  const rows = await databases.listDocuments(DB_ID, 'user_bans', [
    Query.equal('banned_email', profile.email),
    Query.equal('is_active', true),
    Query.limit(1),
  ]).catch(() => ({ documents: [] }));
  return rows.documents.length > 0;
}

function parseJson(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(String(value)); } catch { return {}; }
}

function validRequestId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value);
}

async function firstDocument(databases, collection, queries) {
  const rows = await databases.listDocuments(DB_ID, collection, [...queries, Query.limit(1)]);
  return rows.documents[0] || null;
}

// Creates a document with per-document grants; retries without grants if the
// grant target is invalid (e.g. deleted account).
async function createDocumentSafe(databases, collection, data, permissions = []) {
  if (permissions.length > 0) {
    try {
      return await databases.createDocument(DB_ID, collection, ID.unique(), data, permissions);
    } catch (err) {
      if (err?.code === 409) throw err;
      return databases.createDocument(DB_ID, collection, ID.unique(), data);
    }
  }
  return databases.createDocument(DB_ID, collection, ID.unique(), data);
}

async function writeOnce(databases, collection, data, permissions = []) {
  if (data.idempotency_key) {
    const existing = await firstDocument(databases, collection, [
      Query.equal('idempotency_key', data.idempotency_key),
    ]).catch(() => null);
    if (existing) return existing;
  }
  return createDocumentSafe(databases, collection, data, permissions);
}

async function resolveChargeId(stripe, paymentRecord) {
  if (paymentRecord.charge_id) return paymentRecord.charge_id;
  if (!paymentRecord.payment_intent_id) return '';
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentRecord.payment_intent_id).catch(() => null);
  if (!paymentIntent) return '';
  return typeof paymentIntent.latest_charge === 'string'
    ? paymentIntent.latest_charge
    : paymentIntent.latest_charge?.id || '';
}

function creditAvailableCents(credit) {
  const remaining = Number(credit?.remaining_amount_cents);
  if (Number.isInteger(remaining) && remaining >= 0) return remaining;
  const available = Number(credit?.available_amount_cents);
  if (Number.isInteger(available) && available >= 0) return available;
  const total = Number(credit?.total_credits || 0);
  const used = Number(credit?.used_credits || 0);
  const remainingUnits = Math.max(0, total - used);
  const perSession = Number(credit?.per_session_base_price_cents);
  if (Number.isInteger(perSession) && perSession > 0) return remainingUnits * perSession;
  const amount = Number(credit?.amount_cents) || 0;
  return total > 0 ? Math.floor((amount * remainingUnits) / total) : 0;
}

function creditStatusAfterRefund(credit, remainingAfter, fullRefund) {
  const reserved = Number(credit?.reserved_amount_cents || 0);
  const spent = Number(credit?.spent_amount_cents || credit?.earned_amount_cents || 0);
  if (fullRefund && reserved > 0) return 'frozen';
  if (fullRefund) return spent > 0 ? 'exhausted' : 'refunded';
  if (remainingAfter <= 0) return reserved > 0 ? 'frozen' : 'exhausted';
  return credit?.status === 'frozen' ? 'frozen' : 'active';
}

async function activeReservationsForCredit(databases, creditId) {
  const rows = await databases.listDocuments(DB_ID, 'credit_reservations', [
    Query.equal('credit_lot_id', creditId),
    Query.equal('status', 'reserved'),
    Query.limit(25),
  ]).catch(() => ({ documents: [] }));
  return rows.documents;
}

async function applyUnusedCreditRefund(databases, paymentRecord, refundCents, fullRefund, refundId, metadata, permissions) {
  const creditId = paymentRecord.credit_lot_id || paymentRecord.credit_id;
  if (!creditId) return { debit: 0, credit: null };
  const credit = await databases.getDocument(DB_ID, 'session_credits', creditId).catch(() => null);
  if (!credit) return { debit: 0, credit: null };

  const available = creditAvailableCents(credit);
  const debit = Math.min(refundCents, available);
  if (debit <= 0) {
    if (fullRefund) {
      const status = creditStatusAfterRefund(credit, available, true);
      await databases.updateDocument(DB_ID, 'session_credits', credit.$id, { status }).catch(() => {});
      return { debit: 0, credit: { ...credit, status } };
    }
    return { debit: 0, credit };
  }

  const refunded = Number(credit.refunded_amount_cents || 0);
  const remainingAfter = Math.max(0, available - debit);
  await writeOnce(databases, 'credit_ledger_entries', {
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
    idempotency_key: `credit_refund_${paymentRecord.$id}_${refundId}`,
    metadata: JSON.stringify({ refund_id: refundId, requested_refund_cents: refundCents }),
  }, permissions).catch(() => {});

  const update = {
    remaining_amount_cents: remainingAfter,
    refunded_amount_cents: refunded + debit,
    status: creditStatusAfterRefund(credit, remainingAfter, fullRefund),
  };
  if (credit.available_amount_cents !== undefined) update.available_amount_cents = remainingAfter;
  await databases.updateDocument(DB_ID, 'session_credits', credit.$id, update).catch(() => {});
  return { debit, credit: { ...credit, ...update } };
}

async function reverseTransfersForRefund(databases, stripe, {
  paymentRecord,
  sessionId,
  refundCents,
  basisCents,
  requestId,
}) {
  if (!(refundCents > 0) || !(basisCents > 0)) return [];
  const queries = sessionId
    ? [Query.equal('session_id', sessionId), Query.limit(50)]
    : [Query.equal('payment_record_id', paymentRecord.$id), Query.limit(50)];
  const transferRows = await databases.listDocuments(DB_ID, 'stripe_transfer_records', queries).catch(() => ({ documents: [] }));
  const reversals = [];
  for (const transfer of transferRows.documents) {
    if (!transfer.transfer_id || transfer.status === 'reversed') continue;
    const liveTransfer = await stripe.transfers.retrieve(transfer.transfer_id).catch(() => null);
    if (!liveTransfer) continue;
    const transferAmount = Number(liveTransfer.amount || transfer.amount || transfer.amount_cents || 0);
    const alreadyReversed = Number(liveTransfer.amount_reversed || 0);
    const target = Math.floor((transferAmount * Math.min(refundCents, basisCents)) / basisCents);
    const maxReversible = Math.max(0, transferAmount - alreadyReversed);
    const delta = Math.min(Math.max(0, target - alreadyReversed), maxReversible);
    if (delta <= 0) continue;
    const reversal = await stripe.transfers.createReversal(transfer.transfer_id, {
      amount: delta,
      metadata: {
        payment_record_id: paymentRecord.$id,
        request_id: requestId,
        session_id: sessionId || '',
      },
    }, {
      idempotencyKey: `rev_${transfer.transfer_id}_${target}`,
    });
    const fullyReversed = target >= transferAmount;
    await databases.updateDocument(DB_ID, 'stripe_transfer_records', transfer.$id, {
      reversal_id: reversal.id,
      status: fullyReversed ? 'reversed' : transfer.status || 'paid',
    }).catch(() => {});
    reversals.push({
      transfer_record_id: transfer.$id,
      transfer_id: transfer.transfer_id,
      reversal_id: reversal.id,
      amount: delta,
      destination: transfer.destination_account_id || '',
      owner_type: transfer.owner_type || 'coach',
      owner_id: transfer.owner_id || '',
      session_id: transfer.session_id || sessionId || '',
      credit_reservation_id: transfer.credit_reservation_id || '',
    });
  }
  return reversals;
}

export default async ({ req, res, error }) => {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      error?.('[refundStripePayment] STRIPE_SECRET_KEY is not configured.');
      return res.json({ error: 'Service configuration error.' }, 500);
    }
    const accountId = callerAccountId(req);
    if (!accountId) return res.json({ error: 'Authentication required.' }, 401);

    const payload = body(req);
    const paymentRecordId = payload.payment_record_id;
    const requestId = payload.request_id;
    if (typeof paymentRecordId !== 'string' || !/^[A-Za-z0-9._-]{1,64}$/.test(paymentRecordId)) {
      return res.json({ error: 'payment_record_id is required.' }, 400);
    }
    if (!validRequestId(requestId)) {
      return res.json({ error: 'request_id is required (1-64 chars, letters/digits/_/-).' }, 400);
    }

    const { databases, users } = services();

    // Admin authority comes from account labels via the Users API — never from
    // a client-supplied or profile role.
    const account = await users.get(accountId).catch(() => null);
    if (!account) return res.json({ error: 'Authentication required.' }, 401);
    const labels = Array.isArray(account.labels) ? account.labels : [];
    if (!labels.includes('admin') && !labels.includes('superadmin')) {
      return res.json({ error: 'Admin access required.' }, 403);
    }

    const actor = await profileForAccount(databases, accountId).catch(() => null);
    if (await callerBanned(databases, actor)) {
      return res.json({ error: 'Account access is restricted.' }, 403);
    }

    const paymentRecord = await databases.getDocument(DB_ID, 'stripe_payment_records', paymentRecordId).catch(() => null);
    if (!paymentRecord) return res.json({ error: 'Payment record not found.' }, 404);

    const totalAmount = Number(paymentRecord.amount || 0);
    const previouslyRefunded = Number(paymentRecord.refunded_amount || 0);
    const remaining = totalAmount - previouslyRefunded;
    if (!Number.isInteger(totalAmount) || totalAmount <= 0) {
      return res.json({ error: 'Payment record has no refundable amount.' }, 400);
    }
    if (paymentRecord.status === 'refunded' || remaining <= 0) {
      return res.json({ error: 'Payment is already fully refunded.' }, 400);
    }

    const paymentCreditId = paymentRecord.credit_lot_id || paymentRecord.credit_id;
    const credit = paymentCreditId
      ? await databases.getDocument(DB_ID, 'session_credits', paymentCreditId).catch(() => null)
      : null;
    const unusedCreditCents = credit ? creditAvailableCents(credit) : remaining;
    const refundEarnedSessionId = String(payload.session_id || '').trim();
    const adminOverride = payload.admin_override === true || payload.override === true;
    const overrideReservedRefund = adminOverride || payload.override_reserved_refund === true;
    const overrideReleasedRefund = adminOverride || payload.override_released_refund === true || payload.reverse_released_transfers === true;

    if (credit && Number(credit.reserved_amount_cents || 0) > 0 && !overrideReservedRefund) {
      const activeReservations = await activeReservationsForCredit(databases, credit.$id);
      if (activeReservations.length > 0) {
        return res.json({
          error: 'This credit has reserved value on an incomplete session. Cancel/restore that reservation before refunding, or use an explicit admin override.',
          reserved_amount_cents: Number(credit.reserved_amount_cents || 0),
          reservation_ids: activeReservations.map((r) => r.$id),
          requires_admin_override: true,
        }, 409);
      }
    }

    // Full refund of the remaining balance unless a partial amount is given.
    let refundCents = (refundEarnedSessionId || overrideReleasedRefund) ? remaining : Math.min(remaining, unusedCreditCents);
    if (payload.amount_cents != null) {
      const cents = Number(payload.amount_cents);
      if (!Number.isInteger(cents) || cents <= 0 || cents > remaining) {
        return res.json({ error: 'Refund amount is invalid.' }, 400);
      }
      refundCents = cents;
    }
    if (!refundEarnedSessionId && !overrideReleasedRefund && refundCents > unusedCreditCents) {
      return res.json({ error: 'Refund amount exceeds unused available credit.' }, 400);
    }
    if (refundCents <= 0) {
      return res.json({ error: 'No unused credit is available to refund.' }, 400);
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: STRIPE_API_VERSION });
    const chargeId = await resolveChargeId(stripe, paymentRecord);
    if (!chargeId) return res.json({ error: 'Payment record has no Stripe charge to refund.' }, 400);

    // Stripe idempotency key — retries of the same request_id never double-refund.
    const refund = await stripe.refunds.create({
      charge: chargeId,
      amount: refundCents,
      metadata: {
        payment_record_id: paymentRecord.$id,
        refunded_by_account_id: accountId,
        request_id: requestId,
        reason: String(payload.reason || '').slice(0, 400),
      },
    }, {
      idempotencyKey: `refund_${paymentRecord.$id}_${requestId}`,
    });

    // Replay guard: if this refund was already applied to our records (same
    // request_id retried), return the current state without re-applying.
    const existingRefundEntry = await firstDocument(databases, 'payment_ledger_entries', [
      Query.equal('payment_record_id', paymentRecord.$id),
      Query.equal('type', 'refund'),
      Query.equal('stripe_ref', refund.id),
    ]).catch(() => null);
    if (existingRefundEntry) {
      return res.json({
        payment_record_id: paymentRecord.$id,
        refund_id: refund.id,
        status: paymentRecord.status,
        state: paymentRecord.state || '',
        refunded_amount: previouslyRefunded,
        duplicate: true,
      });
    }

    // Cumulative refunded total comes from Stripe (the source of truth), so a
    // retry that slipped past the ledger replay-guard window can never
    // double-count refunded_amount in our records.
    const refreshedCharge = await stripe.charges.retrieve(chargeId).catch(() => null);
    const newRefundedTotal = refreshedCharge
      ? Number(refreshedCharge.amount_refunded || 0)
      : previouslyRefunded + refundCents;
    const fullRefund = newRefundedTotal >= totalAmount;
    const metadata = parseJson(paymentRecord.metadata);
    const currency = paymentRecord.currency || 'usd';
    const clientReadGrant = metadata.client_account_id
      ? [Permission.read(Role.user(metadata.client_account_id))]
      : [];
    const creditRefund = await applyUnusedCreditRefund(
      databases,
      paymentRecord,
      refundEarnedSessionId ? 0 : refundCents,
      fullRefund,
      refund.id,
      metadata,
      clientReadGrant,
    );
    const releasedRefundCents = Math.max(0, refundCents - creditRefund.debit);
    const earnedSession = refundEarnedSessionId
      ? await databases.getDocument(DB_ID, 'sessions', refundEarnedSessionId).catch(() => null)
      : null;
    const reversalBasisCents = refundEarnedSessionId
      ? (Number(earnedSession?.price_snapshot_cents || 0) || releasedRefundCents || refundCents)
      : totalAmount;
    const reversals = releasedRefundCents > 0
      ? await reverseTransfersForRefund(databases, stripe, {
        paymentRecord,
        sessionId: refundEarnedSessionId,
        refundCents: releasedRefundCents,
        basisCents: reversalBasisCents,
        requestId,
      })
      : [];

    const updated = await databases.updateDocument(DB_ID, 'stripe_payment_records', paymentRecord.$id, {
      refund_id: refund.id,
      refunded_amount: newRefundedTotal,
      // Legacy status enum has no partially_refunded: keep 'paid' until full.
      status: fullRefund ? 'refunded' : 'paid',
      state: fullRefund ? 'refunded' : 'partially_refunded',
      webhook_processed_at: new Date().toISOString(),
    });

    // Ledger: one refund entry plus one transfer_reversal entry per leg.
    await writeOnce(databases, 'payment_ledger_entries', {
      payment_record_id: paymentRecord.$id,
      type: 'refund',
      amount_cents: refundCents,
      currency,
      owner_type: 'client',
      owner_id: metadata.client_profile_id || '',
      stripe_ref: refund.id,
      coach_id: metadata.coach_id || '',
      organization_id: metadata.originating_organization_id || metadata.organization_id || '',
      credit_lot_id: paymentRecord.credit_lot_id || paymentRecord.credit_id || '',
      idempotency_key: `ledger_refund_${refund.id}`,
      metadata: JSON.stringify({
        request_id: requestId,
        reason: payload.reason || '',
        session_id: refundEarnedSessionId,
        unused_credit_refund_cents: creditRefund.debit,
        released_transfer_refund_cents: releasedRefundCents,
        admin_override: adminOverride || overrideReservedRefund || overrideReleasedRefund,
      }),
    }, clientReadGrant);
    for (const reversal of reversals) {
      await writeOnce(databases, 'payment_ledger_entries', {
        payment_record_id: paymentRecord.$id,
        type: 'transfer_reversal',
        amount_cents: reversal.amount,
        currency,
        owner_type: reversal.owner_type,
        owner_id: reversal.owner_id,
        stripe_ref: reversal.reversal_id,
        coach_id: reversal.owner_type === 'coach' ? reversal.owner_id : (metadata.coach_id || ''),
        organization_id: reversal.owner_type === 'org' ? reversal.owner_id : (metadata.originating_organization_id || metadata.organization_id || ''),
        session_id: reversal.session_id || refundEarnedSessionId,
        credit_lot_id: paymentRecord.credit_lot_id || paymentRecord.credit_id || '',
        credit_reservation_id: reversal.credit_reservation_id || '',
        idempotency_key: `ledger_transfer_reversal_${reversal.reversal_id}`,
        metadata: JSON.stringify({ request_id: requestId, transfer_id: reversal.transfer_id, refund_id: refund.id }),
      }).catch(() => {});
    }

    await databases.createDocument(DB_ID, 'audit_logs', ID.unique(), {
      actor_email: actor?.email || account.email || '',
      actor_role: 'admin',
      action: 'stripe.refund',
      entity_type: 'StripePaymentRecord',
      entity_id: paymentRecord.$id,
      before: JSON.stringify({
        status: paymentRecord.status,
        state: paymentRecord.state || '',
        refunded_amount: previouslyRefunded,
      }),
      after: JSON.stringify({
        status: updated.status,
        state: updated.state || '',
        refund_id: refund.id,
        refunded_amount: newRefundedTotal,
        reversal_ids: reversals.map((r) => r.reversal_id),
      }),
      metadata: JSON.stringify({
        request_id: requestId,
        reason: payload.reason || '',
        checkout_session_id: paymentRecord.checkout_session_id || '',
        unused_credit_refund_cents: creditRefund.debit,
        released_transfer_refund_cents: releasedRefundCents,
        override_reserved_refund: overrideReservedRefund,
        override_released_refund: overrideReleasedRefund,
      }),
    }).catch(() => {});

    return res.json({
      payment_record_id: updated.$id,
      refund_id: refund.id,
      status: updated.status,
      state: updated.state || '',
      refunded_amount: newRefundedTotal,
      reversals: reversals.map(({ transfer_id, reversal_id, amount }) => ({ transfer_id, reversal_id, amount })),
    });
  } catch (err) {
    error?.(`[refundStripePayment] ${err?.message || err}`);
    return res.json({ error: 'Could not refund Stripe payment.' }, 500);
  }
};
