import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

async function sendEmail({ to, subject, html }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "LC Training <notifications@lctraining.app>",
      to,
      subject,
      html,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Resend error");
  return data;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { clientEmail, clientName, coachEmail, coachName, dateStr, time, durationLabel, county, sessionGoals, origin } = await req.json();

    // Email to client
    await sendEmail({
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
    });

    // Email to coach
    await sendEmail({
      to: coachEmail,
      subject: `New Booking — ${clientName} on ${dateStr}`,
      html: `<div style="background:#0A0E14;color:#F8FAFC;padding:40px;font-family:sans-serif;">
        <h1 style="color:#F59E0B;font-family:sans-serif;text-transform:uppercase;letter-spacing:2px;">New Session Booked</h1>
        <p><strong>${clientName}</strong> has booked a session with you.</p>
        <p>Date: ${dateStr}<br/>Time: ${time}<br/>Duration: ${durationLabel}<br/>County: ${county}</p>
        ${sessionGoals ? `<p>Goals: ${sessionGoals}</p>` : ''}
      </div>`,
    });

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});