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

function syncFields(account) {
  return {
    charges_enabled: !!account.charges_enabled,
    payouts_enabled: !!account.payouts_enabled,
    details_submitted: !!account.details_submitted,
    requirements_due: JSON.stringify(account.requirements?.currently_due || []),
    disabled_reason: account.requirements?.disabled_reason || '',
    last_synced_at: new Date().toISOString(),
  };
}

// Upsert keyed by stripe_account_id. New rows can only be created when the
// account carries our owner metadata (set at creation time by stripeConnect).
async function handleAccountUpdated(db, account) {
  if (!account?.id) return false;
  const rows = await db.listDocuments(DB_ID, 'stripe_connected_accounts', [
    Query.equal('stripe_account_id', account.id),
    Query.limit(1),
  ]);
  const existing = rows.documents[0] || null;

  if (existing) {
    await db.updateDocument(DB_ID, 'stripe_connected_accounts', existing.$id, syncFields(account));
    return true;
  }

  const ownerType = account.metadata?.owner_type;
  const ownerId = account.metadata?.owner_id;
  if ((ownerType !== 'coach' && ownerType !== 'org') || !ownerId) return false;
  await db.createDocument(DB_ID, 'stripe_connected_accounts', ID.unique(), {
    owner_type: ownerType,
    owner_id: String(ownerId).slice(0, 64),
    stripe_account_id: account.id,
    account_mode: 'controller_express',
    ...syncFields(account),
  });
  return true;
}

export default async ({ req, res, error }) => {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'missing', { apiVersion: STRIPE_API_VERSION });
  let event;
  try {
    const signature = req.headers?.['stripe-signature'] || req.headers?.['Stripe-Signature'];
    if (!signature || !process.env.STRIPE_CONNECT_WEBHOOK_SECRET) {
      return res.json({ error: 'Stripe Connect webhook signature configuration missing.' }, 400);
    }
    event = stripe.webhooks.constructEvent(rawBody(req), signature, process.env.STRIPE_CONNECT_WEBHOOK_SECRET);
  } catch (err) {
    error?.(`[stripeConnectWebhook] signature verification failed: ${err?.message || err}`);
    return res.json({ error: 'Invalid Stripe webhook signature.' }, 400);
  }

  const db = databases();
  const webhookRecord = await createWebhookEvent(db, event);
  if (!webhookRecord) {
    return res.json({ received: true, duplicate: true });
  }

  try {
    let handled = false;
    if (event.type === 'account.updated') {
      handled = await handleAccountUpdated(db, event.data.object);
    }

    await db.updateDocument(DB_ID, 'stripe_webhook_events', webhookRecord.$id, {
      status: handled ? 'processed' : 'ignored',
      processed_at: new Date().toISOString(),
    });
    return res.json({ received: true, handled });
  } catch (err) {
    error?.(`[stripeConnectWebhook] ${event.id}: ${err?.message || err}`);
    await db.updateDocument(DB_ID, 'stripe_webhook_events', webhookRecord.$id, {
      status: 'failed',
      error: String(err?.message || err).slice(0, 2000),
    }).catch(() => {});
    return res.json({ error: 'Stripe Connect webhook processing failed.' }, 500);
  }
};
