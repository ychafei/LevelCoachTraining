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
    const p = body(req);
    const subject = `LevelCoach booking confirmed: ${p.dateStr || 'training session'}`;
    const clientHtml = `
      <p>Hi ${p.clientName || 'there'},</p>
      <p>Your session with <strong>${p.coachName || 'your coach'}</strong> is confirmed.</p>
      <p><strong>${p.dateStr || ''}</strong><br/>${p.timeRange || ''}<br/>${p.county ? `${p.county} County` : ''}</p>
      <p>You can manage sessions from your LevelCoach dashboard.</p>
    `;
    const coachHtml = `
      <p>Hi ${p.coachName || 'Coach'},</p>
      <p>A session with <strong>${p.clientName || p.clientEmail || 'a client'}</strong> is confirmed.</p>
      <p><strong>${p.dateStr || ''}</strong><br/>${p.timeRange || ''}<br/>${p.county ? `${p.county} County` : ''}</p>
    `;
    const results = [];
    if (p.clientEmail) results.push(await sendEmail({ to: p.clientEmail, subject, html: clientHtml }));
    if (p.coachEmail) results.push(await sendEmail({ to: p.coachEmail, subject, html: coachHtml }));
    return res.json({ ok: true, sent: results.length });
  } catch (err) {
    error?.(err?.message || String(err));
    return res.json({ error: 'Could not send booking emails.', detail: err?.message || String(err) }, 500);
  }
};
