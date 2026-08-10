import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

// Public base URL of the Next.js web app. Must be set as a function secret:
//   supabase secrets set APP_BASE_URL=https://<your-web-app-domain>
const APP_BASE_URL = (Deno.env.get("APP_BASE_URL") ?? "").replace(/\/$/, "");
// The engine route authenticates with a literal compare against the web app's
// SUPABASE_SERVICE_ROLE_KEY (Vercel env). Supabase injects THIS function's own
// service-role key, which can differ byte-for-byte, so set it explicitly:
//   supabase secrets set CRON_ENGINE_KEY=<web app's SUPABASE_SERVICE_ROLE_KEY>
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
 * Thin trigger for time-driven rider requests.
 *
 * pg_cron (migration 102) pings this every minute. All the logic lives in
 * POST /api/cron/request-due-riders so that requesting a rider has exactly one
 * implementation, shared with the merchant's Mark Ready and the hybrid picker.
 * Mirrors reconcile-bolt-rides and settle-payouts.
 *
 * Forwards its request body through, so a manual invocation can pass
 * { "dry_run": true } or { "order_ids": [...] } for testing without waiting for
 * a tick.
 */
serve(async (req) => {
  if (!isAuthorized(req)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!APP_BASE_URL) {
    console.error("[request-due-riders] APP_BASE_URL secret is not set");
    return new Response(JSON.stringify({ error: "APP_BASE_URL not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!SERVICE_KEY) {
    console.error("[request-due-riders] service key missing");
    return new Response(JSON.stringify({ error: "service key not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let forwardBody = "{}";
  try {
    const text = await req.text();
    if (text.trim()) forwardBody = text;
  } catch {
    // pg_cron posts '{}'; an unreadable body is not worth failing over.
  }

  try {
    const res = await fetch(`${APP_BASE_URL}/api/cron/request-due-riders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: forwardBody,
    });

    const body = await res.text();
    if (!res.ok) {
      console.error(`[request-due-riders] engine returned HTTP ${res.status}: ${body}`);
      return new Response(
        JSON.stringify({ error: "engine error", status: res.status, body }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(body, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[request-due-riders] trigger failed:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
