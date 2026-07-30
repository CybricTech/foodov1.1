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

/**
 * Thin trigger for Bolt ride reconciliation.
 *
 * pg_cron (migration 096) pings this every 5 minutes. All the logic lives in
 * POST /api/cron/reconcile-bolt-rides so it shares one state machine with the
 * webhook. Mirrors settle-payouts and reconcile-pending-payments.
 */
serve(async () => {
  if (!APP_BASE_URL) {
    console.error("[bolt-reconcile] APP_BASE_URL secret is not set");
    return new Response(JSON.stringify({ error: "APP_BASE_URL not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!SERVICE_KEY) {
    console.error("[bolt-reconcile] service key missing");
    return new Response(JSON.stringify({ error: "service key not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const res = await fetch(`${APP_BASE_URL}/api/cron/reconcile-bolt-rides`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });

    const body = await res.text();
    if (!res.ok) {
      console.error(`[bolt-reconcile] engine returned HTTP ${res.status}: ${body}`);
      return new Response(JSON.stringify({ error: "engine error", status: res.status, body }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(body, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[bolt-reconcile] trigger failed:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
