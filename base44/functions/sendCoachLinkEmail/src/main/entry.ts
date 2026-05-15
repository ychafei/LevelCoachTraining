// Auth-required (admin-initiated) — emails a coach a verification link they
// must click while signed in to confirm being linked to a coach profile.
// Body: { to, link, coachName }

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
    const link = typeof body.link === 'string' ? body.link.trim() : '';
    const coachName = typeof body.coachName === 'string' ? body.coachName.trim() : 'a coach profile';
    if (!to || !link) return res.json({ error: 'Missing to or link', diagnostics }, 400);
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
        subject: 'LC Training - Confirm Your Coach Account Link',
        html: `<div style="background:#050505;color:#F8F8F8;padding:40px;font-family:sans-serif;">
          <h1 style="color:#C9A646;text-transform:uppercase;letter-spacing:2px;">Confirm Coach Link</h1>
          <p>An LC Training administrator linked <strong>${to}</strong> to <strong>${coachName}</strong>.</p>
          <p>Click below while signed in to this account to confirm and activate your coach access.</p>
          <div style="text-align:center;margin:32px 0;">
            <a href="${link}" style="display:inline-block;font-size:16px;font-weight:bold;color:#050505;background:#C9A646;padding:16px 28px;border-radius:8px;text-decoration:none;">Verify &amp; Activate</a>
          </div>
          <p style="color:#94A3B8;font-size:12px;">If you didn't expect this, you can ignore this email and the link will not be activated.</p>
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
    error(`sendCoachLinkEmail: ${err?.message || err}`);
    return res.json({ error: err?.message || String(err), diagnostics }, 500);
  }
};
