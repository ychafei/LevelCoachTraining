import { Client, Databases, Query } from 'node-appwrite';

// Auth-required — creates a PayPal order. custom_id encodes the buyer +
// package info so the webhook can credit the right account on capture.

export default async ({ req, res, error }) => {
  try {
    const userId = req.headers['x-appwrite-user-id'];
    if (!userId) return res.json({ error: 'Unauthorized' }, 401);

    const dbClient = new Client()
      .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT || 'https://nyc.cloud.appwrite.io/v1')
      .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
      .setKey(req.headers['x-appwrite-key'] ?? process.env.APPWRITE_API_KEY);
    const databases = new Databases(dbClient);

    const me = (await databases.listDocuments('lctraining', 'profiles', [
      Query.equal('account_id', userId), Query.limit(1),
    ])).documents[0];
    if (!me) return res.json({ error: 'Profile not found' }, 404);

    const body = req.bodyJson || (req.body ? JSON.parse(req.body) : {});
    const { amount, packageId, packageName, packageSessions, sessionDurationMinutes } = body;

    const clientId = process.env.PAYPAL_CLIENT_ID;
    const secretKey = process.env.PAYPAL_SECRET_KEY;
    if (!clientId || !secretKey) return res.json({ error: 'PayPal env vars missing' }, 500);

    const tokenRes = await fetch('https://api-m.paypal.com/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${clientId}:${secretKey}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    const { access_token } = await tokenRes.json();

    const customId = `${me.email}|${packageId}|${packageName}|${packageSessions}|${sessionDurationMinutes}`;

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
      error(`PayPal order creation failed: ${JSON.stringify(order)}`);
      return res.json({ error: 'Failed to create PayPal order', details: order }, 500);
    }
    return res.json({ orderId: order.id });
  } catch (err) {
    error(`createPaypalOrder: ${err?.message || err}`);
    return res.json({ error: err?.message || String(err) }, 500);
  }
};
