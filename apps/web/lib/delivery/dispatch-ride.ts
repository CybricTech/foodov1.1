/**
 * Single entry point for "this order now needs a rider".
 *
 * Replaces the direct sendTelegramRiderAlert() calls so there is exactly one
 * place that decides between booking a Bolt ride and paging the humans in the
 * Telegram group.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { bookRideForOrder } from "@/lib/bolt/book-ride";
import { sendTelegramRiderAlert } from "@/lib/telegram";

export async function dispatchRideForOrder(
  supabase: SupabaseClient,
  orderId: string,
  restaurantId: string,
  orderNumber: string | number,
  source = "unknown"
): Promise<void> {
  const result = await bookRideForOrder(supabase, orderId, source);

  if (result.outcome === "booked") {
    // Mark the rider request as handled so a later dispatch write can't page
    // the group for a ride that is already on its way. Uses the same latch the
    // Telegram path claims, so the two mechanisms can't disagree.
    await supabase
      .from("orders")
      .update({ rider_alert_sent_at: new Date().toISOString() })
      .eq("id", orderId)
      .is("rider_alert_sent_at", null);
    return;
  }

  if (result.outcome === "skipped") {
    // Another caller holds the booking claim and owns the outcome. Paging here
    // would race a booking that may be seconds from succeeding, and a human
    // booking on top of an API booking means two riders and two fares. If that
    // caller died mid-flight, the reconciliation cron surfaces it instead.
    return;
  }

  // Disabled, shadow mode, or a booking that could not be made: fall back to
  // the manual flow. sendTelegramRiderAlert carries its own idempotency latch.
  await sendTelegramRiderAlert(supabase, orderId, restaurantId, orderNumber, source);
}
