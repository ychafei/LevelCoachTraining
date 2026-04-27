import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// HMAC-SHA256 signature verification for Stripe webhooks
async function verifyStripeSignature(payload: string, sigHeader: string, secret: string): Promise<boolean> {
  const parts = sigHeader.split(',').reduce((acc: Record<string, string>, part: string) => {
    const [key, val] = part.split('=');
    acc[key] = val;
    return acc;
  }, {});

  const timestamp = parts['t'];
  const signature = parts['v1'];
  if (!timestamp || !signature) return false;

  // Reject events older than 5 minutes (replay protection)
  const age = Math.floor(Date.now() / 1000) - parseInt(timestamp);
  if (age > 300) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  const expected = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');

  return expected === signature;
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const body = await req.text();
  const sigHeader = req.headers.get('stripe-signature') || '';
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

  // Verify signature if webhook secret is configured
  if (webhookSecret) {
    const valid = await verifyStripeSignature(body, sigHeader, webhookSecret);
    if (!valid) {
      console.log('Stripe webhook signature verification failed');
      return Response.json({ error: 'Invalid signature' }, { status: 400 });
    }
  }

  const event = JSON.parse(body);

  // Handle checkout.session.completed
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const meta = session.metadata || {};

    const clientEmail = meta.client_email;
    const clientName = meta.client_name || clientEmail;
    const packageId = meta.package_id;
    const packageName = meta.package_name;
    const packageSessions = parseInt(meta.package_sessions) || 1;
    const durationMinutes = parseInt(meta.session_duration_minutes) || 60;

    if (clientEmail) {
      // Idempotency: use Stripe Checkout Session ID as package_id to prevent duplicates
      const existing = await base44.asServiceRole.entities.SessionCredit.filter({
        client_email: clientEmail,
        package_id: session.id,
      });

      if (existing.length === 0) {
        await base44.asServiceRole.entities.SessionCredit.create({
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
        console.log(`Stripe: Credits created for ${clientEmail}, package ${packageName}, ${packageSessions} sessions × ${durationMinutes} min`);
      } else {
        console.log(`Stripe: Duplicate webhook for session ${session.id}, skipping`);
      }
    }
  }

  return Response.json({ received: true });
});
