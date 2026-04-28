import { Client, Databases, Query } from 'node-appwrite';

// Auth-required — creates a Stripe Checkout Session and returns its hosted URL.
// Body: { amount, packageId, packageName, packageSessions, sessionDurationMinutes }

export default async ({ req, res, error }) => {
  const diagnostics = [];
  try {
    const userId = req.headers['x-appwrite-user-id'];
    if (!userId) return res.json({ error: 'Unauthorized' }, 401);

    // Look up caller's profile to embed email/name in Stripe metadata
    const dbClient = new Client()
      .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT || 'https://nyc.cloud.appwrite.io/v1')
      .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
      .setKey(req.headers['x-appwrite-key'] ?? process.env.APPWRITE_API_KEY);
    const databases = new Databases(dbClient);

    const profileResult = await databases.listDocuments('lctraining', 'profiles', [
      Query.equal('account_id', userId), Query.limit(1),
    ]);
    const me = profileResult.documents[0];
    if (!me) return res.json({ error: 'Profile not found' }, 404);

    diagnostics.push('auth: OK, user=' + me.email);

    const body = req.bodyJson || (req.body ? JSON.parse(req.body) : {});
    const { amount, packageId, packageName, packageSessions, sessionDurationMinutes } = body;
    diagnostics.push('amount=' + amount);

    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) return res.json({ error: 'STRIPE_SECRET_KEY not set', diagnostics });

    const origin = req.headers['origin'] || req.headers['referer'] || process.env.APP_BASE_URL || 'https://lctraining.com';

    const params = new URLSearchParams();
    params.append('mode', 'payment');
    params.append('success_url', origin + '/book?stripe_success=1&session_id={CHECKOUT_SESSION_ID}');
    params.append('cancel_url', origin + '/book');
    params.append('line_items[0][price_data][currency]', 'usd');
    params.append('line_items[0][price_data][unit_amount]', String(Math.round(amount * 100)));
    params.append('line_items[0][price_data][product_data][name]', (packageName || 'Coaching Session') + ' - Coaching Session');
    params.append('line_items[0][quantity]', '1');
    params.append('metadata[client_email]', me.email);
    params.append('metadata[client_name]', `${me.first_name || ''} ${me.last_name || ''}`.trim() || me.email);
    params.append('metadata[package_id]', packageId || '');
    params.append('metadata[package_name]', packageName || '');
    params.append('metadata[package_sessions]', String(packageSessions || 1));
    params.append('metadata[session_duration_minutes]', String(sessionDurationMinutes || 60));

    const fetchHeaders = {
      'Authorization': 'Bearer ' + secretKey,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Version': '2024-12-18.acacia',
    };

    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: fetchHeaders,
      body: params.toString(),
    });
    const data = await stripeRes.json();
    diagnostics.push('stripe_status=' + stripeRes.status);

    if (data.error) {
      diagnostics.push('stripe_error_msg=' + data.error.message);
      return res.json({ error: data.error.message, diagnostics });
    }
    if (data.id && data.url) return res.json({ sessionId: data.id, url: data.url });
    return res.json({ error: 'Unexpected Stripe response', diagnostics, stripe_response: data });
  } catch (err) {
    error(`createStripeCheckout: ${err?.message || err}`);
    diagnostics.push('crash: ' + String(err));
    return res.json({ error: String(err), diagnostics });
  }
};
