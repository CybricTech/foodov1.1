import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const RESEND_FROM = Deno.env.get("RESEND_FROM_EMAIL") ?? "no-reply@foodo.ng";

interface EmailPayload {
  template: "merchant-onboarding" | "password-reset" | "super-admin-alert";
  to: string;
  props: Record<string, string>;
}

function buildHtml(payload: EmailPayload): { subject: string; html: string } {
  switch (payload.template) {
    case "merchant-onboarding":
      return {
        subject: `Welcome to Foodo — Your restaurant is live, ${payload.props.restaurantName}`,
        html: `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;background:#f4f4f4;padding:20px">
<div style="max-width:520px;margin:0 auto;background:white;border-radius:16px;overflow:hidden">
  <div style="background:#2D6A4F;padding:32px 24px;text-align:center">
    <h1 style="color:white;margin:0;font-size:22px">Welcome to Foodo! 🎉</h1>
  </div>
  <div style="padding:24px">
    <p style="color:#333">Hi ${payload.props.restaurantName},</p>
    <p style="color:#555">Your restaurant has been set up on Foodo. Here are your login details:</p>
    <div style="background:#f8f8f8;border-radius:12px;padding:16px;margin:16px 0">
      <p style="margin:4px 0;font-size:14px"><strong>Email:</strong> ${payload.props.email}</p>
      <p style="margin:4px 0;font-size:14px"><strong>Temporary password:</strong> ${payload.props.temporaryPassword}</p>
    </div>
    <p style="color:#555;font-size:14px">Please change your password after your first login.</p>
    <div style="margin:24px 0">
      <a href="${payload.props.dashboardUrl}" style="display:inline-block;background:#2D6A4F;color:white;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">
        Go to Dashboard →
      </a>
    </div>
    <p style="color:#555;font-size:13px">Your storefront is live at:</p>
    <a href="${payload.props.storefrontUrl}" style="color:#2D6A4F;font-size:13px">${payload.props.storefrontUrl}</a>
  </div>
</div>
</body>
</html>`,
      };

    case "password-reset":
      return {
        subject: "Reset your Foodo password",
        html: `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;background:#f4f4f4;padding:20px">
<div style="max-width:520px;margin:0 auto;background:white;border-radius:16px;padding:32px">
  <h2 style="color:#2D6A4F">Reset your password</h2>
  <p style="color:#555">Click the link below to reset your password. This link expires in 1 hour.</p>
  <a href="${payload.props.resetUrl}" style="display:inline-block;background:#2D6A4F;color:white;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;margin-top:16px">
    Reset password →
  </a>
</div>
</body>
</html>`,
      };

    case "super-admin-alert":
      return {
        subject: `⚠️ Foodo Admin Alert: ${payload.props.title}`,
        html: `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;background:#f4f4f4;padding:20px">
<div style="max-width:520px;margin:0 auto;background:white;border-radius:16px;padding:32px;border-left:4px solid #E63946">
  <h2 style="color:#E63946">${payload.props.title}</h2>
  <p style="color:#555">${payload.props.message}</p>
  <p style="color:#aaa;font-size:12px">${new Date().toISOString()}</p>
</div>
</body>
</html>`,
      };

    default:
      throw new Error(`Unknown template: ${payload.template}`);
  }
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let payload: EmailPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { subject, html } = buildHtml(payload);

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: [payload.to],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error("Resend error:", err);
    return new Response(
      JSON.stringify({ error: "Email failed" }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(JSON.stringify({ sent: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
