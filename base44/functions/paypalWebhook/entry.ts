import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const body = await req.text();
  const payload = JSON.parse(body);

  // Verify webhook signature
  const clientId = Deno.env.get('PAYPAL_CLIENT_ID');
  const secretKey = Deno.env.get('PAYPAL_SECRET_KEY');
  const webhookId = Deno.env.get('PAYPAL_WEBHOOK_ID');

  const tokenRes = await fetch('https://api-m.sandbox.paypal.com/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + btoa(`${clientId}:${secretKey}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const { access_token } = await tokenRes.json();

  const verifyRes = await fetch('https://api-m.sandbox.paypal.com/v1/notifications/verify-webhook-signature', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      auth_algo: req.headers.get('paypal-auth-algo'),
      cert_url: req.headers.get('paypal-cert-url'),
      transmission_id: req.headers.get('paypal-transmission-id'),
      transmission_sig: req.headers.get('paypal-transmission-sig'),
      transmission_time: req.headers.get('paypal-transmission-time'),
      webhook_id: webhookId,
      webhook_event: payload,
    }),
  });
  const { verification_status } = await verifyRes.json();

  if (verification_status !== 'SUCCESS') {
    console.log('Webhook verification failed:', verification_status);
    return Response.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Handle payment capture completed
  if (payload.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
    const customId = payload.resource?.supplementary_data?.related_ids?.order_id
      ? null // will parse from purchase unit below
      : payload.resource?.custom_id;

    // Try to get custom_id from the capture resource
    const captureCustomId = payload.resource?.custom_id || customId;

    if (captureCustomId) {
      const parts = captureCustomId.split('|');
      if (parts.length >= 4) {
        const [clientEmail, packageId, packageName, packageSessionsStr] = parts;
        const packageSessions = parseInt(packageSessionsStr) || 1;

        // Check if credit already exists (idempotent)
        const existing = await base44.asServiceRole.entities.SessionCredit.filter({
          client_email: clientEmail,
          package_id: packageId,
        });

        // Only create if there's no active credit for this package
        const hasActive = existing.some(c => c.used_credits < c.total_credits);
        if (!hasActive) {
          await base44.asServiceRole.entities.SessionCredit.create({
            client_email: clientEmail,
            client_name: clientEmail,
            package_id: packageId,
            package_name: packageName,
            total_credits: packageSessions,
            used_credits: 0,
            per_session_base_price: 0,
          });
          console.log(`Credits created for ${clientEmail}, package ${packageName}`);
        }
      }
    }
  }

  return Response.json({ received: true });
});