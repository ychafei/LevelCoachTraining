import { Client, Databases, Query, ID } from 'node-appwrite';

// Public, signature-verified — listens for PAYMENT.CAPTURE.COMPLETED and creates
// a session_credits row idempotently.

export default async ({ req, res, log, error }) => {
  try {
    const body = typeof req.body === 'string' ? req.body : (req.bodyRaw || JSON.stringify(req.bodyJson || {}));
    const payload = JSON.parse(body);

    const clientId = process.env.PAYPAL_CLIENT_ID;
    const secretKey = process.env.PAYPAL_SECRET_KEY;
    const webhookId = process.env.PAYPAL_WEBHOOK_ID;

    const tokenRes = await fetch('https://api-m.paypal.com/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${clientId}:${secretKey}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    const { access_token } = await tokenRes.json();

    const verifyRes = await fetch('https://api-m.paypal.com/v1/notifications/verify-webhook-signature', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        auth_algo: req.headers['paypal-auth-algo'],
        cert_url: req.headers['paypal-cert-url'],
        transmission_id: req.headers['paypal-transmission-id'],
        transmission_sig: req.headers['paypal-transmission-sig'],
        transmission_time: req.headers['paypal-transmission-time'],
        webhook_id: webhookId,
        webhook_event: payload,
      }),
    });
    const { verification_status } = await verifyRes.json();
    if (verification_status !== 'SUCCESS') {
      log(`PayPal webhook verification failed: ${verification_status}`);
      return res.json({ error: 'Invalid signature' }, 400);
    }

    if (payload.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
      const customId = payload.resource?.custom_id;
      if (customId) {
        const parts = customId.split('|');
        if (parts.length >= 4) {
          const [clientEmail, packageId, packageName, packageSessionsStr, durationMinutesStr] = parts;
          const packageSessions = parseInt(packageSessionsStr, 10) || 1;
          const durationMinutes = parseInt(durationMinutesStr, 10) || 60;
          const captureId = payload.resource?.id;

          const dbClient = new Client()
            .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT || 'https://nyc.cloud.appwrite.io/v1')
            .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
            .setKey(req.headers['x-appwrite-key'] ?? process.env.APPWRITE_API_KEY);
          const databases = new Databases(dbClient);

          const existing = await databases.listDocuments('lctraining', 'session_credits', [
            Query.equal('client_email', clientEmail),
            Query.equal('package_id', captureId || packageId),
            Query.limit(1),
          ]);

          if (existing.documents.length === 0) {
            await databases.createDocument('lctraining', 'session_credits', ID.unique(), {
              client_email: clientEmail,
              client_name: clientEmail,
              package_id: captureId || packageId,
              package_name: packageName,
              total_credits: packageSessions,
              used_credits: 0,
              session_duration_minutes: durationMinutes,
              per_session_base_price: 0,
              payment_processor: 'paypal',
            });
            log(`PayPal credits created for ${clientEmail}, ${packageName}, ${packageSessions} × ${durationMinutes}min`);
          }
        }
      }
    }

    return res.json({ received: true });
  } catch (err) {
    error(`paypalWebhook: ${err?.message || err}`);
    return res.json({ error: err?.message || String(err) }, 500);
  }
};
