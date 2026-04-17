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
      from: "LC Training <support@lctrainings.com>",
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

    const { to, code } = await req.json();
    if (!to || !code) return Response.json({ error: "Missing to or code" }, { status: 400 });

    await sendEmail({
      to,
      subject: "LC Training — Email Verification Code",
      html: `<div style="background:#0A0E14;color:#F8FAFC;padding:40px;font-family:sans-serif;">
        <h1 style="color:#F59E0B;font-family:sans-serif;text-transform:uppercase;letter-spacing:2px;">Verify Your Coach Email</h1>
        <p>Enter this code in your LC Training Settings page to confirm <strong>${to}</strong> as your coach contact address.</p>
        <div style="text-align:center;margin:32px 0;">
          <span style="display:inline-block;font-size:32px;letter-spacing:8px;font-weight:bold;color:#F59E0B;background:#1a1a1a;padding:16px 24px;border-radius:8px;">${code}</span>
        </div>
        <p style="color:#94A3B8;font-size:12px;">If you didn't request this, you can ignore this email.</p>
      </div>`,
    });

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
