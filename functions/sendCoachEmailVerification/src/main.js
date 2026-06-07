function body(req) {
  if (req.bodyJson && typeof req.bodyJson === 'object') return req.bodyJson;
  try { return JSON.parse(req.bodyRaw || req.body || '{}'); } catch { return {}; }
}

async function sendEmail({ to, subject, html }) {
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not configured.');
  const from = process.env.EMAIL_FROM || 'LevelCoach Training <no-reply@levelcoach.com>';
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || data?.error || `Resend returned ${response.status}`);
  return data;
}

export default async ({ req, res, error }) => {
  try {
    const { to, code } = body(req);
    if (!to || !code) return res.json({ error: 'to and code are required.' }, 400);
    await sendEmail({
      to,
      subject: 'LevelCoach Training - Email Verification Code',
      html: `
        <p>Enter this code in your coach profile to verify your email address:</p>
        <p style="font-size:28px; font-weight:700; letter-spacing:6px;">${code}</p>
        <p>If you did not request this, you can ignore this email.</p>
      `,
    });
    return res.json({ ok: true });
  } catch (err) {
    error?.(err?.message || String(err));
    return res.json({ error: 'Could not send coach verification email.', detail: err?.message || String(err) }, 500);
  }
};
