import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Caller auth — see settle-payouts/index.ts. Not yet deployed, fixed ahead of
// time so it's not a repeat gap when it goes live.
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

/**
 * Called by pg_cron every 15 minutes.
 * Retries SMS logs with status='failed' from the last 2 hours.
 */
serve(async (req) => {
  if (!isAuthorized(req)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }
  const { data: failedLogs, error } = await supabase
    .from("sms_logs")
    .select("id, restaurant_id, order_id, phone, message, event_type")
    .eq("status", "failed")
    .gte(
      "created_at",
      new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    )
    .limit(50);

  if (error) {
    console.error("Failed to fetch failed SMS logs:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
    });
  }

  const results = await Promise.allSettled(
    (failedLogs ?? []).map(async (log) => {
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/send-sms`,
        {
          method: "POST",
          headers: {
            // send-sms checks its caller — this must match its expected key.
            Authorization: `Bearer ${CRON_ENGINE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            restaurantId: log.restaurant_id,
            phone: log.phone,
            eventType: log.event_type,
            orderId: log.order_id,
          }),
        }
      );
      return { logId: log.id, ok: res.ok };
    })
  );

  const retried = results.filter((r) => r.status === "fulfilled").length;

  return new Response(
    JSON.stringify({ retried, total: failedLogs?.length ?? 0 }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
