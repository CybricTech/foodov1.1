import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

// Public base URL of the Next.js web app. Must be set as a function secret:
//   supabase secrets set APP_BASE_URL=https://<your-web-app-domain>
const APP_BASE_URL = (Deno.env.get("APP_BASE_URL") ?? "").replace(/\/$/, "");
// The engine route authenticates the caller with a literal string compare
// against the web app's SUPABASE_SERVICE_ROLE_KEY (Vercel env). Supabase injects
// THIS function's own service-role key, which can differ byte-for-byte from
// Vercel's, so the forwarded bearer must be the value the route expects. Set it
// explicitly to match the web app:
//   supabase secrets set CRON_ENGINE_KEY=<web app's SUPABASE_SERVICE_ROLE_KEY>
// Falls back to the injected key when they're already the same.
const SERVICE_KEY =
  Deno.env.get("CRON_ENGINE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

/**
 * Thin trigger for the automated payout engine.
 *
 * pg_cron (migration 082) pings this once daily. All the money logic — the
 * canonical net formula, the wallet ledger, the Paystack transfers — lives in
 * the Next.js route POST /api/cron/settle-payouts, so this function does exactly
 * one thing: forward the trigger to that route, authenticated with the service
 * role key (which the route checks). Mirrors reconcile-pending-payments.
 *
 * Nothing here moves money or computes anything; keeping the engine in the web
 * app means it shares ONE copy of the settlement math with the manual route.
 */
serve(async () => {
  if (!APP_BASE_URL) {
    console.error("[settle-payouts] APP_BASE_URL secret is not set — cannot trigger engine");
    return new Response(JSON.stringify({ error: "APP_BASE_URL not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!SERVICE_KEY) {
    console.error("[settle-payouts] SUPABASE_SERVICE_ROLE_KEY missing");
    return new Response(JSON.stringify({ error: "service key not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const res = await fetch(`${APP_BASE_URL}/api/cron/settle-payouts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });

    const body = await res.text();
    if (!res.ok) {
      console.error(`[settle-payouts] engine returned HTTP ${res.status}: ${body}`);
      return new Response(JSON.stringify({ error: "engine error", status: res.status, body }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    console.log(`[settle-payouts] engine ok: ${body}`);
    return new Response(body, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[settle-payouts] failed to reach engine:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "unknown" }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }
});
