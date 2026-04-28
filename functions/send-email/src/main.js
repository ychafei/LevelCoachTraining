// Generic email-send wrapper called from src/lib/email.js after cutover.
// Replaces the Base44 frontend SendEmail surface (which is a spam vector if
// exposed to clients). Body: { to, subject, body }.

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM = 'LC Training <support@lctrainings.com>';

export default async ({ req, res, error }) => {
  try {
    const userId = req.headers['x-appwrite-user-id'];
    if (!userId) return res.json({ error: 'Unauthorized' }, 401);
    if (!RESEND_API_KEY) return res.json({ error: 'RESEND_API_KEY not set' }, 500);

    const body = req.bodyJson || (req.body ? JSON.parse(req.body) : {});
    const to = typeof body.to === 'string' ? body.to.trim() : '';
    const subject = typeof body.subject === 'string' ? body.subject : '';
    const html = typeof body.body === 'string' ? body.body : '';
    if (!to || !subject || !html) return res.json({ error: 'Missing to/subject/body' }, 400);

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM, to, subject, html }),
    });
    if (!r.ok) {
      const text = await r.text();
      return res.json({ error: `Resend ${r.status}: ${text}` }, 502);
    }
    return res.json({ success: true });
  } catch (err) {
    error(`send-email: ${err?.message || err}`);
    return res.json({ error: err?.message || String(err) }, 500);
  }
};
