import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

Deno.serve(async (req) => {
  const diagnostics: Record<string, unknown> = {
    step: "start",
    hasResendKey: !!RESEND_API_KEY,
    resendKeyLen: RESEND_API_KEY ? RESEND_API_KEY.length : 0,
  };

  try {
    diagnostics.step = "auth";
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    diagnostics.authed = !!user;
    if (!user) {
      return Response.json({ error: "Unauthorized", diagnostics }, { status: 401 });
    }

    diagnostics.step = "parse_body";
    const body = await req.json().catch(() => ({}));
    const to = typeof body.to === "string" ? body.to.trim() : "";
    const code = typeof body.code === "string" ? body.code.trim() : "";
    diagnostics.to = to;
    diagnostics.hasCode = !!code;
    if (!to || !code) {
      return Response.json({ error: "Missing to or code", diagnostics }, { status: 400 });
    }

    if (!RESEND_API_KEY) {
      return Response.json({
        error: "RESEND_API_KEY env var is not set on this function. Add it in the Base44 function environment.",
        diagnostics,
      }, { status: 500 });
    }

    diagnostics.step = "resend_request";
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "LC Training <support@lctrainings.com>",
        to,
        subject: "LC Training - Email Verification Code",
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

    diagnostics.step = "resend_response";
    diagnostics.resendStatus = resendRes.status;
    const resendBody = await resendRes.text();
    diagnostics.resendBody = resendBody;

    if (!resendRes.ok) {
      return Response.json({
        error: `Resend returned ${resendRes.status}: ${resendBody}`,
        diagnostics,
      }, { status: 502 });
    }

    return Response.json({ success: true, diagnostics });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      diagnostics,
    }, { status: 500 });
  }
});
