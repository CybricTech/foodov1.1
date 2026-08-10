import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * scheduled-order-alerts — merchant "slot approaching" push fan-out.
 *
 * Invoked every minute by pg_cron (migration 087, `net.http_post` pattern from
 * 081/reconcile-pending-payments). Finds paid scheduled orders that are not
 * yet activated and whose slot is within the restaurant's alert_lead_minutes,
 * sends the merchant a push via the existing send-push function
 * (kind: "scheduled_slot_approaching"), then stamps scheduled_alert_sent_at
 * so the alert fires exactly once per order.
 *
 * Volume is tiny (a handful of pending pre-orders platform-wide), so the
 * lead-time filter happens in JS after a single indexed query
 * (orders_scheduled_pending_activation).
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Caller auth — see settle-payouts/index.ts. Only pg_cron should call this,
// authenticated with the same value (pulled from vault.cron_bearer_key).
const CRON_ENGINE_KEY = Deno.env.get("CRON_ENGINE_KEY") ?? SUPABASE_SERVICE_KEY;
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function isAuthorized(req: Request): boolean {
  if (!CRON_ENGINE_KEY) return false;
  return timingSafeEqual(req.headers.get("authorization") ?? "", `Bearer ${CRON_ENGINE_KEY}`);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const DEFAULT_ALERT_LEAD_MINUTES = 30;
/** Hard ceiling on the lookahead so one query covers every merchant config. */
const MAX_ALERT_LEAD_MINUTES = 240;

serve(async (req) => {
  if (!isAuthorized(req)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Candidate rows: pending activation, not yet alerted, slot within the
  // maximum possible lead window. Per-restaurant lead applied below.
  const horizon = new Date(
    Date.now() + MAX_ALERT_LEAD_MINUTES * 60_000
  ).toISOString();

  const { data: orders, error } = await supabase
    .from("orders")
    .select(
      "id, restaurant_id, order_number, customer_name, total_kobo, scheduled_for, restaurants (scheduling_settings)"
    )
    .not("scheduled_for", "is", null)
    .is("activated_at", null)
    .is("scheduled_alert_sent_at", null)
    .neq("status", "cancelled")
    .lte("scheduled_for", horizon);

  if (error) {
    console.error("scheduled-order-alerts: query failed:", error);
    return new Response(JSON.stringify({ error: "query failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const now = Date.now();
  let sent = 0;

  for (const row of orders ?? []) {
    const o = row as unknown as {
      id: string;
      restaurant_id: string;
      order_number: string;
      customer_name: string | null;
      total_kobo: number | null;
      scheduled_for: string;
      restaurants: { scheduling_settings: Record<string, unknown> | null } | null;
    };

    const settings = o.restaurants?.scheduling_settings ?? {};
    const leadRaw = (settings as { alert_lead_minutes?: unknown }).alert_lead_minutes;
    const leadMinutes =
      typeof leadRaw === "number" && Number.isFinite(leadRaw) && leadRaw > 0
        ? Math.min(leadRaw, MAX_ALERT_LEAD_MINUTES)
        : DEFAULT_ALERT_LEAD_MINUTES;

    const slotMs = new Date(o.scheduled_for).getTime();
    if (!Number.isFinite(slotMs)) continue;
    // Not yet inside this restaurant's alert window — a later run catches it.
    if (slotMs - now > leadMinutes * 60_000) continue;

    // Stamp FIRST (conditional, so a concurrent run can't double-send); only
    // rows we actually claimed get a push.
    const { data: claimed } = await supabase
      .from("orders")
      .update({ scheduled_alert_sent_at: new Date().toISOString() })
      .eq("id", o.id)
      .is("scheduled_alert_sent_at", null)
      .select("id")
      .maybeSingle();
    if (!claimed) continue;

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
        method: "POST",
        headers: {
          // send-push now checks its caller — this must match its expected key.
          Authorization: `Bearer ${CRON_ENGINE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          restaurantId: o.restaurant_id,
          orderId: o.id,
          orderNumber: o.order_number,
          totalKobo: o.total_kobo ?? undefined,
          customerName: o.customer_name ?? undefined,
          kind: "scheduled_slot_approaching",
          scheduledFor: o.scheduled_for,
        }),
      });
      if (!res.ok) {
        console.error(
          `scheduled-order-alerts: push failed for order ${o.id}: ${res.status}`
        );
      } else {
        sent++;
      }
    } catch (e) {
      console.error(`scheduled-order-alerts: push error for order ${o.id}:`, e);
    }
  }

  return new Response(
    JSON.stringify({ success: true, candidates: orders?.length ?? 0, sent }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
