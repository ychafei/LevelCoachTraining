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
    const { to, link, coachName } = body(req);
    if (!to || !link) return res.json({ error: 'to and link are required.' }, 400);
    await sendEmail({
      to,
      subject: 'Verify your LevelCoach coach profile link',
      html: `
        <p>You were invited to link your account to ${coachName || 'a coach profile'} on LevelCoach Training.</p>
        <p><a href="${link}">Review and verify the coach link</a></p>
        <p>If you did not request this, ignore this email.</p>
      `,
    });
    return res.json({ ok: true });
  } catch (err) {
    error?.(err?.message || String(err));
    return res.json({ error: 'Could not send coach link email.', detail: err?.message || String(err) }, 500);
  }
};
