import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const diagnostics = [];

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized', step: 'auth' });
    }
    diagnostics.push('auth: OK, user=' + user.email);

    const body = await req.json();
    const { amount, packageId, packageName, packageSessions, sessionDurationMinutes } = body;
    diagnostics.push('body: OK, amount=' + amount);

    const secretKey = Deno.env.get('STRIPE_SECRET_KEY');
    diagnostics.push('key_exists: ' + !!secretKey);
    diagnostics.push('key_prefix: ' + (secretKey ? secretKey.substring(0, 12) : 'MISSING'));

    if (!secretKey) {
      return Response.json({ error: 'STRIPE_SECRET_KEY not found', diagnostics });
    }

    const origin = req.headers.get('origin') || req.headers.get('referer') || 'https://lctraining.base44.app';
    diagnostics.push('origin: ' + origin);

    const params = new URLSearchParams();
    params.append('mode', 'payment');
    params.append('success_url', origin + '/book?stripe_success=1&session_id={CHECKOUT_SESSION_ID}');
    params.append('cancel_url', origin + '/book');
    params.append('line_items[0][price_data][currency]', 'usd');
    params.append('line_items[0][price_data][unit_amount]', String(Math.round(amount * 100)));
    params.append('line_items[0][price_data][product_data][name]', packageName + ' - Coaching Session');
    params.append('line_items[0][quantity]', '1');
    params.append('metadata[client_email]', user.email);
    params.append('metadata[client_name]', user.full_name || user.email);
    params.append('metadata[package_id]', packageId || '');
    params.append('metadata[package_name]', packageName || '');
    params.append('metadata[package_sessions]', String(packageSessions || 1));
    params.append('metadata[session_duration_minutes]', String(sessionDurationMinutes || 60));

    const fetchHeaders = {
      'Authorization': 'Bearer ' + secretKey,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Version': '2024-12-18.acacia',
    };

    // Only add Stripe-Account for org-level keys
    if (secretKey.startsWith('sk_org_') || secretKey.startsWith('rk_org_')) {
      fetchHeaders['Stripe-Account'] = Deno.env.get('STRIPE_ACCOUNT_ID') || 'acct_1P5lEAClCNOrs1rW';
      diagnostics.push('stripe_account: ' + fetchHeaders['Stripe-Account']);
    } else {
      diagnostics.push('stripe_account: not needed (standard key)');
    }

    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: fetchHeaders,
      body: params.toString(),
    });

    const data = await res.json();
    diagnostics.push('stripe_status: ' + res.status);

    if (data.error) {
      diagnostics.push('stripe_error_type: ' + data.error.type);
      diagnostics.push('stripe_error_msg: ' + data.error.message);
      return Response.json({ error: data.error.message, diagnostics });
    }

    if (data.id && data.url) {
      return Response.json({ sessionId: data.id, url: data.url });
    }

    return Response.json({ error: 'Unexpected response', diagnostics, stripe_response: data });
  } catch (err) {
    diagnostics.push('crash: ' + String(err));
    return Response.json({ error: String(err), diagnostics });
  }
});
