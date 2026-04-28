// Auth-required — emails a coach a verification code via Resend.
// Body: { to, code }

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM = 'LC Training <support@lctrainings.com>';

export default async ({ req, res, error }) => {
  const diagnostics = { step: 'start', hasResendKey: !!RESEND_API_KEY };
  try {
    const userId = req.headers['x-appwrite-user-id'];
    if (!userId) return res.json({ error: 'Unauthorized', diagnostics }, 401);

    diagnostics.step = 'parse_body';
    const body = req.bodyJson || (req.body ? JSON.parse(req.body) : {});
    const to = typeof body.to === 'string' ? body.to.trim() : '';
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    if (!to || !code) return res.json({ error: 'Missing to or code', diagnostics }, 400);
    if (!RESEND_API_KEY) return res.json({ error: 'RESEND_API_KEY not set', diagnostics }, 500);

    diagnostics.step = 'resend_request';
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM,
        to,
        subject: 'LC Training - Email Verification Code',
        html: `<div style="background:#0A0E14;color:#F8FAFC;padding:40px;font-family:sans-serif;">
          <h1 style="color:#F59E0B;text-transform:uppercase;letter-spacing:2px;">Verify Your Coach Email</h1>
          <p>Enter this code in your LC Training Settings page to confirm <strong>${to}</strong> as your coach contact address.</p>
          <div style="text-align:center;margin:32px 0;">
            <span style="display:inline-block;font-size:32px;letter-spacing:8px;font-weight:bold;color:#F59E0B;background:#1a1a1a;padding:16px 24px;border-radius:8px;">${code}</span>
          </div>
          <p style="color:#94A3B8;font-size:12px;">If you didn't request this, you can ignore this email.</p>
        </div>`,
      }),
    });
    diagnostics.resendStatus = r.status;
    if (!r.ok) {
      const text = await r.text();
      return res.json({ error: `Resend ${r.status}: ${text}`, diagnostics }, 502);
    }
    return res.json({ success: true, diagnostics });
  } catch (err) {
    error(`sendCoachEmailVerification: ${err?.message || err}`);
    return res.json({ error: err?.message || String(err), diagnostics }, 500);
  }
};
