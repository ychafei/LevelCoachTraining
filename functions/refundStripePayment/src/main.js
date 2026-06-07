import { Client, Databases, ID, Query } from 'node-appwrite';
import Stripe from 'stripe';

const DB_ID = process.env.APPWRITE_DATABASE_ID || 'levelcoach';
const STRIPE_API_VERSION = process.env.STRIPE_API_VERSION || '2026-02-25.clover';

function services() {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://nyc.cloud.appwrite.io/v1')
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);
  return { databases: new Databases(client) };
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

function refundAmountCents(payload, paymentRecord) {
  if (payload.amount_cents != null) {
    const cents = Number(payload.amount_cents);
    if (Number.isFinite(cents) && cents > 0) return Math.round(cents);
  }
  if (payload.amount != null) {
    const dollars = Number(payload.amount);
    if (Number.isFinite(dollars) && dollars > 0) return Math.round(dollars * 100);
  }
  return Number(paymentRecord.amount || 0);
}

async function closeCreditIfFullyRefunded(databases, paymentRecord, amount) {
  if (!paymentRecord.credit_id) return;
  if (amount < Number(paymentRecord.amount || 0)) return;
  const credit = await databases.getDocument(DB_ID, 'session_credits', paymentRecord.credit_id).catch(() => null);
  if (!credit) return;
  const total = Number(credit.total_credits || 0);
  const used = Number(credit.used_credits || 0);
  if (total > used) {
    await databases.updateDocument(DB_ID, 'session_credits', credit.$id, { used_credits: total }).catch(() => {});
  }
}

export default async ({ req, res, error }) => {
  try {
    if (!process.env.STRIPE_SECRET_KEY) return res.json({ error: 'STRIPE_SECRET_KEY is not configured.' }, 500);
    const accountId = callerAccountId(req);
    if (!accountId) return res.json({ error: 'Authentication required.' }, 401);

    const payload = body(req);
    const paymentRecordId = payload.payment_record_id;
    if (!paymentRecordId) return res.json({ error: 'payment_record_id is required.' }, 400);

    const { databases } = services();
    const actor = await profileForAccount(databases, accountId);
    if (actor?.role !== 'admin' && actor?.role !== 'super_admin') {
      return res.json({ error: 'Admin access required.' }, 403);
    }

    const paymentRecord = await databases.getDocument(DB_ID, 'stripe_payment_records', paymentRecordId);
    if (!paymentRecord.payment_intent_id) return res.json({ error: 'Payment record has no Stripe payment_intent_id.' }, 400);
    if (paymentRecord.status === 'refunded') return res.json({ error: 'Payment is already fully refunded.' }, 400);

    const amount = refundAmountCents(payload, paymentRecord);
    if (!amount || amount <= 0 || amount > Number(paymentRecord.amount || 0)) {
      return res.json({ error: 'Refund amount is invalid.' }, 400);
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: STRIPE_API_VERSION });
    const refund = await stripe.refunds.create({
      payment_intent: paymentRecord.payment_intent_id,
      amount,
      metadata: {
        payment_record_id: paymentRecord.$id,
        refunded_by_profile_id: actor.$id,
        reason: String(payload.reason || '').slice(0, 400),
      },
    }, {
      idempotencyKey: `lc_refund_${paymentRecord.$id}_${amount}`,
    });

    const fullRefund = amount >= Number(paymentRecord.amount || 0);
    const updated = await databases.updateDocument(DB_ID, 'stripe_payment_records', paymentRecord.$id, {
      refund_id: refund.id,
      refunded_amount: amount,
      status: fullRefund ? 'refunded' : paymentRecord.status || 'paid',
      webhook_processed_at: new Date().toISOString(),
    });
    if (fullRefund) await closeCreditIfFullyRefunded(databases, paymentRecord, amount);

    await databases.createDocument(DB_ID, 'audit_logs', ID.unique(), {
      actor_email: actor.email || '',
      actor_role: actor.role || 'admin',
      action: 'stripe.refund',
      entity_type: 'StripePaymentRecord',
      entity_id: paymentRecord.$id,
      before: JSON.stringify({ status: paymentRecord.status, refunded_amount: paymentRecord.refunded_amount || 0 }),
      after: JSON.stringify({ status: updated.status, refund_id: refund.id, refunded_amount: amount }),
      metadata: JSON.stringify({ reason: payload.reason || '', checkout_session_id: paymentRecord.checkout_session_id || '' }),
    }).catch(() => {});

    return res.json({
      payment_record_id: updated.$id,
      refund_id: refund.id,
      status: updated.status,
      refunded_amount: amount,
    });
  } catch (err) {
    error?.(err?.message || String(err));
    return res.json({ error: 'Could not refund Stripe payment.', detail: err?.message || String(err) }, 500);
  }
};
