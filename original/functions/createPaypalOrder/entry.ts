import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { amount, packageId, packageName, packageSessions, sessionDurationMinutes } = await req.json();

  const clientId = Deno.env.get('PAYPAL_CLIENT_ID');
  const secretKey = Deno.env.get('PAYPAL_SECRET_KEY');

  // Get PayPal access token
  const tokenRes = await fetch('https://api-m.paypal.com/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + btoa(`${clientId}:${secretKey}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const { access_token } = await tokenRes.json();

  // Create order with custom_id encoding user + package info
  const customId = `${user.email}|${packageId}|${packageName}|${packageSessions}|${sessionDurationMinutes}`;

  const orderRes = await fetch('https://api-m.paypal.com/v2/checkout/orders', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        amount: { currency_code: 'USD', value: String(amount) },
        custom_id: customId,
        description: `${packageName} - Coaching Session`,
      }],
    }),
  });

  const order = await orderRes.json();
  if (!order.id) {
    console.error('PayPal order creation failed:', JSON.stringify(order));
    return Response.json({ error: 'Failed to create PayPal order', details: order }, { status: 500 });
  }
  return Response.json({ orderId: order.id });
  } catch (error) {
    console.error('[ERROR] createPaypalOrder:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});