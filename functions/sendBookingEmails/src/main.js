// Auth-required — sends booking confirmation emails (client + coach + support)
// via Resend. Body matches the legacy Base44 function.

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM = 'LC Training <support@lctrainings.com>';
const SUPPORT_TO = 'support@lctrainings.com';

async function sendEmail({ to, subject, html }) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.message || 'Resend error');
  return data;
}

export default async ({ req, res, error }) => {
  try {
    const userId = req.headers['x-appwrite-user-id'];
    if (!userId) return res.json({ error: 'Unauthorized' }, 401);
    if (!RESEND_API_KEY) return res.json({ error: 'RESEND_API_KEY not set' }, 500);

    const body = req.bodyJson || (req.body ? JSON.parse(req.body) : {});
    const { clientEmail, clientName, coachEmail, coachName, dateStr, time, durationLabel, county, sessionGoals, origin } = body;

    const results = await Promise.allSettled([
      sendEmail({
        to: clientEmail,
        subject: `Booking Confirmed — ${dateStr} with ${coachName}`,
        html: `<div style="background:#0A0E14;color:#F8FAFC;padding:40px;font-family:sans-serif;">
          <h1 style="color:#F59E0B;font-family:sans-serif;text-transform:uppercase;letter-spacing:2px;">Booking Confirmed</h1>
          <p>Your session with <strong>${coachName}</strong> is scheduled for <strong>${dateStr}</strong> at <strong>${time}</strong> (${durationLabel}).</p>
          <p>County: ${county}</p>
          ${sessionGoals ? `<p>Goals: ${sessionGoals}</p>` : ''}
          <p style="margin-top:20px;"><strong>Cancellation Policy:</strong> Sessions cancelled with less than 24 hours notice may incur a late-cancellation fee at the coach's discretion.</p>
          <p style="margin-top:20px;"><a href="${origin}/pay" style="background:#F59E0B;color:#0A0E14;padding:12px 24px;text-decoration:none;font-weight:bold;border-radius:6px;">Pay Now</a></p>
        </div>`,
      }),
      sendEmail({
        to: coachEmail,
        subject: `New Booking — ${clientName} on ${dateStr}`,
        html: `<div style="background:#0A0E14;color:#F8FAFC;padding:40px;font-family:sans-serif;">
          <h1 style="color:#F59E0B;font-family:sans-serif;text-transform:uppercase;letter-spacing:2px;">New Session Booked</h1>
          <p><strong>${clientName}</strong> has booked a session with you.</p>
          <p>Date: ${dateStr}<br/>Time: ${time}<br/>Duration: ${durationLabel}<br/>County: ${county}</p>
          ${sessionGoals ? `<p>Goals: ${sessionGoals}</p>` : ''}
        </div>`,
      }),
      sendEmail({
        to: SUPPORT_TO,
        subject: `New Booking — ${clientName} on ${dateStr}`,
        html: `<div style="background:#0A0E14;color:#F8FAFC;padding:40px;font-family:sans-serif;">
          <h1 style="color:#F59E0B;font-family:sans-serif;text-transform:uppercase;letter-spacing:2px;">New Session Booked</h1>
          <p><strong>${clientName}</strong> (${clientEmail}) has booked a session with <strong>${coachName}</strong>.</p>
          <p>Date: ${dateStr}<br/>Time: ${time}<br/>Duration: ${durationLabel}<br/>County: ${county}</p>
          ${sessionGoals ? `<p>Goals: ${sessionGoals}</p>` : ''}
        </div>`,
      }),
    ]);

    const errors = results.filter(r => r.status === 'rejected').map(r => r.reason?.message);
    return res.json({ success: true, emailErrors: errors.length ? errors : undefined });
  } catch (err) {
    error(`sendBookingEmails: ${err?.message || err}`);
    return res.json({ error: err?.message || String(err) }, 500);
  }
};
