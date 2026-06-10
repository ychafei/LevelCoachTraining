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

async function resolveChargeId(stripe, paymentRecord) {
  if (paymentRecord.charge_id) return paymentRecord.charge_id;
  if (!paymentRecord.payment_intent_id) return '';
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentRecord.payment_intent_id).catch(() => null);
  if (!paymentIntent) return '';
  return typeof paymentIntent.latest_charge === 'string'
    ? paymentIntent.latest_charge
    : paymentIntent.latest_charge?.id || '';
}

// Maps a transfer destination back to the payee leg via the payout plan stored
// in the payment record metadata.
function ownerForDestination(plan, destination) {
  if (plan?.coach_account_id && destination === plan.coach_account_id) {
    return { owner_type: 'coach', owner_id: plan.coach_id || '' };
  }
  if (plan?.org_account_id && destination === plan.org_account_id) {
    return { owner_type: 'org', owner_id: plan.organization_id || '' };
  }
  return { owner_type: 'coach', owner_id: '' };
}

async function adjustCredit(databases, paymentRecord, refundCents, fullRefund) {
  if (!paymentRecord.credit_id) return;
  const credit = await databases.getDocument(DB_ID, 'session_credits', paymentRecord.credit_id).catch(() => null);
  if (!credit) return;
  const total = Number(credit.total_credits || 0);
  const used = Number(credit.used_credits || 0);
  let newUsed = used;
  if (fullRefund) {
    // Full refund freezes the credit entirely.
    newUsed = total;
  } else {
    // Partial refund removes remaining credits proportionally, bounded at 0 remaining.
    const totalAmount = Number(paymentRecord.amount || 0);
    const creditsToRemove = totalAmount > 0 ? Math.round((total * refundCents) / totalAmount) : 0;
    newUsed = Math.min(total, used + Math.max(0, creditsToRemove));
  }
  if (newUsed !== used) {
    await databases.updateDocument(DB_ID, 'session_credits', credit.$id, { used_credits: newUsed }).catch(() => {});
  }
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

    // Full refund of the remaining balance unless a partial amount is given.
    let refundCents = remaining;
    if (payload.amount_cents != null) {
      const cents = Number(payload.amount_cents);
      if (!Number.isInteger(cents) || cents <= 0 || cents > remaining) {
        return res.json({ error: 'Refund amount is invalid.' }, 400);
      }
      refundCents = cents;
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

    const metadata = parseJson(paymentRecord.metadata);
    const plan = parseJson(metadata.payout_plan);

    // Reverse each transfer proportionally to the refunded fraction.
    const transferRows = await databases.listDocuments(DB_ID, 'stripe_transfer_records', [
      Query.equal('payment_record_id', paymentRecord.$id),
      Query.limit(50),
    ]).catch(() => ({ documents: [] }));

    const newRefundedTotal = previouslyRefunded + refundCents;
    const fullRefund = newRefundedTotal >= totalAmount;
    const reversals = [];
    for (const transfer of transferRows.documents) {
      if (!transfer.transfer_id || transfer.status === 'reversed') continue;
      const reversalAmount = Math.floor((Number(transfer.amount || 0) * refundCents) / totalAmount);
      if (reversalAmount <= 0) continue;
      const reversal = await stripe.transfers.createReversal(transfer.transfer_id, {
        amount: reversalAmount,
        metadata: {
          payment_record_id: paymentRecord.$id,
          request_id: requestId,
        },
      }, {
        idempotencyKey: `refund_${paymentRecord.$id}_${requestId}_rev_${transfer.$id}`,
      });
      await databases.updateDocument(DB_ID, 'stripe_transfer_records', transfer.$id, {
        reversal_id: reversal.id,
        status: fullRefund ? 'reversed' : transfer.status || 'paid',
      }).catch(() => {});
      reversals.push({
        transfer_record_id: transfer.$id,
        transfer_id: transfer.transfer_id,
        reversal_id: reversal.id,
        amount: reversalAmount,
        destination: transfer.destination_account_id || '',
      });
    }

    const updated = await databases.updateDocument(DB_ID, 'stripe_payment_records', paymentRecord.$id, {
      refund_id: refund.id,
      refunded_amount: newRefundedTotal,
      // Legacy status enum has no partially_refunded: keep 'paid' until full.
      status: fullRefund ? 'refunded' : 'paid',
      state: fullRefund ? 'refunded' : 'partially_refunded',
      webhook_processed_at: new Date().toISOString(),
    });

    await adjustCredit(databases, paymentRecord, refundCents, fullRefund);

    // Ledger: one refund entry plus one transfer_reversal entry per leg.
    const currency = paymentRecord.currency || 'usd';
    const clientReadGrant = metadata.client_account_id
      ? [Permission.read(Role.user(metadata.client_account_id))]
      : [];
    await createDocumentSafe(databases, 'payment_ledger_entries', {
      payment_record_id: paymentRecord.$id,
      type: 'refund',
      amount_cents: refundCents,
      currency,
      owner_type: 'client',
      owner_id: metadata.client_profile_id || '',
      stripe_ref: refund.id,
      coach_id: metadata.coach_id || '',
      organization_id: plan.organization_id || '',
      metadata: JSON.stringify({ request_id: requestId, reason: payload.reason || '' }),
    }, clientReadGrant);
    for (const reversal of reversals) {
      const owner = ownerForDestination(plan, reversal.destination);
      await databases.createDocument(DB_ID, 'payment_ledger_entries', ID.unique(), {
        payment_record_id: paymentRecord.$id,
        type: 'transfer_reversal',
        amount_cents: reversal.amount,
        currency,
        owner_type: owner.owner_type,
        owner_id: owner.owner_id,
        stripe_ref: reversal.reversal_id,
        coach_id: metadata.coach_id || '',
        organization_id: plan.organization_id || '',
        metadata: JSON.stringify({ request_id: requestId, transfer_id: reversal.transfer_id }),
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
