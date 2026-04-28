// Auth-required — captures a previously-created PayPal order.

export default async ({ req, res, error }) => {
  try {
    const userId = req.headers['x-appwrite-user-id'];
    if (!userId) return res.json({ error: 'Unauthorized' }, 401);

    const body = req.bodyJson || (req.body ? JSON.parse(req.body) : {});
    const { orderId } = body;
    if (!orderId) return res.json({ error: 'Missing orderId' }, 400);

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

    const captureRes = await fetch(`https://api-m.paypal.com/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json',
      },
    });
    const result = await captureRes.json();
    return res.json({ status: result.status });
  } catch (err) {
    error(`capturePaypalOrder: ${err?.message || err}`);
    return res.json({ error: err?.message || String(err) }, 500);
  }
};
