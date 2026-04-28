import { Client, Databases, Query, ID } from 'node-appwrite';
import crypto from 'node:crypto';

// Public, signature-verified — listens for checkout.session.completed and creates
// a session_credits row idempotently (Stripe checkout session ID is the package_id).

function verifyStripeSignature(payload, sigHeader, secret) {
  if (!sigHeader || !secret) return false;
  const parts = sigHeader.split(',').reduce((acc, p) => {
    const [k, v] = p.split('=');
    acc[k] = v;
    return acc;
  }, {});
  const timestamp = parts['t'];
  const signature = parts['v1'];
  if (!timestamp || !signature) return false;

  // 5-minute replay window
  const age = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10);
  if (Number.isNaN(age) || age > 300) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');

  // Constant-time compare
  if (expected.length !== signature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export default async ({ req, res, log, error }) => {
  try {
    const body = typeof req.body === 'string' ? req.body : (req.bodyRaw || JSON.stringify(req.bodyJson || {}));
    const sigHeader = req.headers['stripe-signature'] || '';
    const secret = process.env.STRIPE_WEBHOOK_SECRET;

    if (secret) {
      const valid = verifyStripeSignature(body, sigHeader, secret);
      if (!valid) {
        log('Stripe webhook signature verification failed');
        return res.json({ error: 'Invalid signature' }, 400);
      }
    }

    const event = JSON.parse(body);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const meta = session.metadata || {};
      const clientEmail = meta.client_email;
      const clientName  = meta.client_name || clientEmail;
      const packageName = meta.package_name;
      const packageSessions = parseInt(meta.package_sessions, 10) || 1;
      const durationMinutes = parseInt(meta.session_duration_minutes, 10) || 60;

      if (clientEmail) {
        const dbClient = new Client()
          .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT || 'https://nyc.cloud.appwrite.io/v1')
          .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
          .setKey(req.headers['x-appwrite-key'] ?? process.env.APPWRITE_API_KEY);
        const databases = new Databases(dbClient);

        // Idempotency: use Stripe Checkout Session ID as package_id.
        const existing = await databases.listDocuments('lctraining', 'session_credits', [
          Query.equal('client_email', clientEmail),
          Query.equal('package_id', session.id),
          Query.limit(1),
        ]);

        if (existing.documents.length === 0) {
          await databases.createDocument('lctraining', 'session_credits', ID.unique(), {
            client_email: clientEmail,
            client_name: clientName,
            package_id: session.id,
            package_name: packageName,
            total_credits: packageSessions,
            used_credits: 0,
            session_duration_minutes: durationMinutes,
            per_session_base_price: 0,
            payment_processor: 'stripe',
          });
          log(`Stripe credits created for ${clientEmail}, ${packageName}, ${packageSessions} × ${durationMinutes}min`);
        } else {
          log(`Stripe duplicate webhook for session ${session.id}, skipping`);
        }
      }
    }

    return res.json({ received: true });
  } catch (err) {
    error(`stripeWebhook: ${err?.message || err}`);
    return res.json({ error: err?.message || String(err) }, 500);
  }
};
