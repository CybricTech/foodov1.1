import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Public base URL of the Next.js web app (e.g. https://drizzybites.…). Must be
// set as a function secret: `supabase secrets set APP_BASE_URL=https://…`.
const APP_BASE_URL = (Deno.env.get("APP_BASE_URL") ?? "").replace(/\/$/, "");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Don't touch payments newer than this — the live webhook + the customer's
// own status poll get first crack. Reconciliation is only for the ones that
// fell through (customer closed the page AND the webhook never landed).
const MIN_AGE_MINUTES = 3;
// Stop chasing after this — a bank-transfer charge left "ongoing" this long has
// effectively been abandoned; the status endpoint will verify it as
// abandoned/expired and flip it to "rejected", clearing the backlog.
const MAX_AGE_DAYS = 7;
const BATCH_LIMIT = 50;

/**
 * Called by pg_cron every few minutes.
 *
 * Finds payments that were initialized but never produced an order
 * (order_id IS NULL, gateway status still "pending") and replays the exact
 * call the customer's browser makes on the pending page:
 *   GET /api/checkout/status?ref=<ref>&provider=<provider>
 *
 * That endpoint re-verifies with the gateway and, on success, atomically
 * claims the payment and creates the order (idempotency guard included). On a
 * terminal failure (abandoned/failed/reversed/expired) it marks the payment
 * "rejected". We deliberately do NOT re-implement order creation here — this is
 * a server-side replay of the poll, so reconciled orders are byte-for-byte
 * identical to ones created when a customer stays on the page.
 */
serve(async () => {
  if (!APP_BASE_URL) {
    console.error("[reconcile] APP_BASE_URL secret is not set — cannot replay status poll");
    return new Response(JSON.stringify({ error: "APP_BASE_URL not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const nowMs = Date.now();
  const minAge = new Date(nowMs - MIN_AGE_MINUTES * 60 * 1000).toISOString();
  const maxAge = new Date(nowMs - MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: stuck, error } = await supabase
    .from("payments")
    .select("id, payment_provider, paystack_ref, monnify_ref, paystack_status, monnify_status, amount_kobo")
    .is("order_id", null)
    .or("paystack_status.eq.pending,monnify_status.eq.pending")
    .gte("created_at", maxAge)
    .lte("created_at", minAge)
    .order("created_at", { ascending: true })
    .limit(BATCH_LIMIT);

  if (error) {
    console.error("[reconcile] failed to fetch stuck payments:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const candidates = stuck ?? [];
  if (candidates.length === 0) {
    return new Response(JSON.stringify({ checked: 0, created: 0, rejected: 0, pending: 0 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const results = await Promise.allSettled(
    candidates.map(async (p) => {
      const isPaystack = p.payment_provider === "paystack";
      // Skip rows whose own provider status isn't actually "pending" (the .or()
      // can match on the *other* provider's column).
      const status = isPaystack ? p.paystack_status : p.monnify_status;
      if (status !== "pending") return { id: p.id, outcome: "skipped" as const };

      const ref = isPaystack ? p.paystack_ref : p.monnify_ref;
      if (!ref) return { id: p.id, outcome: "skipped" as const };

      const params = new URLSearchParams({ ref });
      if (isPaystack) params.set("provider", "paystack");
      // Monnify can assign a different reference than ours; pid lets the status
      // route fall back to a lookup by payment id and patch the ref.
      else params.set("pid", p.id);

      const res = await fetch(`${APP_BASE_URL}/api/checkout/status?${params.toString()}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        console.error(`[reconcile] status poll failed payment=${p.id} ref=${ref} http=${res.status}`);
        return { id: p.id, outcome: "error" as const };
      }

      const body = (await res.json()) as { orderId?: string | null; status?: string };
      if (body.orderId) {
        console.log(`[reconcile] order created payment=${p.id} ref=${ref} order=${body.orderId}`);
        return { id: p.id, outcome: "created" as const };
      }
      if (body.status === "rejected") {
        console.log(`[reconcile] payment rejected payment=${p.id} ref=${ref}`);
        return { id: p.id, outcome: "rejected" as const };
      }
      // Still genuinely pending at the gateway (e.g. bank transfer "ongoing").
      return { id: p.id, outcome: "pending" as const };
    })
  );

  const tally = { created: 0, rejected: 0, pending: 0, error: 0, skipped: 0 };
  for (const r of results) {
    if (r.status === "fulfilled") tally[r.value.outcome]++;
    else tally.error++;
  }

  console.log(`[reconcile] checked=${candidates.length}`, tally);

  return new Response(
    JSON.stringify({ checked: candidates.length, ...tally }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
