import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

/**
 * Called by pg_cron every 15 minutes.
 * Retries SMS logs with status='failed' from the last 2 hours.
 */
serve(async () => {
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
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
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
