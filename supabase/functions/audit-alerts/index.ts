import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

// Public base URL of the Next.js web app. Must be set as a function secret:
//   supabase secrets set APP_BASE_URL=https://<your-web-app-domain>
const APP_BASE_URL = (Deno.env.get("APP_BASE_URL") ?? "").replace(/\/$/, "");
// See settle-payouts/index.ts for why CRON_ENGINE_KEY exists (Supabase's own
// injected service-role key can differ byte-for-byte from Vercel's).
const SERVICE_KEY =
  Deno.env.get("CRON_ENGINE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Caller auth — see settle-payouts/index.ts.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function isAuthorized(req: Request): boolean {
  if (!SERVICE_KEY) return false;
  return timingSafeEqual(req.headers.get("authorization") ?? "", `Bearer ${SERVICE_KEY}`);
}

/**
 * Thin trigger for the audit-alert engine. pg_cron pings this every 5 minutes
 * (see migration 20260809140000). All detection logic lives in the Postgres
 * function evaluate_audit_alerts(); the Next.js route
 * POST /api/cron/audit-alerts formats and sends the Telegram messages. This
 * function does exactly one thing: forward the trigger. Mirrors settle-payouts.
 */
serve(async (req) => {
  if (!isAuthorized(req)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!APP_BASE_URL) {
    console.error("[audit-alerts] APP_BASE_URL secret is not set — cannot trigger engine");
    return new Response(JSON.stringify({ error: "APP_BASE_URL not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!SERVICE_KEY) {
    console.error("[audit-alerts] SUPABASE_SERVICE_ROLE_KEY missing");
    return new Response(JSON.stringify({ error: "service key not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const res = await fetch(`${APP_BASE_URL}/api/cron/audit-alerts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });

    const body = await res.text();
    if (!res.ok) {
      console.error(`[audit-alerts] engine returned HTTP ${res.status}: ${body}`);
      return new Response(JSON.stringify({ error: "engine error", status: res.status, body }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    console.log(`[audit-alerts] engine ok: ${body}`);
    return new Response(body, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[audit-alerts] failed to reach engine:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "unknown" }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }
});
