import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import {
  BOLT_FAILED_STATES,
  getRideDetails,
  getRideReceipt,
  toKobo,
  type BoltEnvironment,
} from "@/lib/bolt";
import { applyRideState, type BoltRideRow } from "@/lib/bolt/apply-ride-state";
import { handleFailedRide } from "@/lib/bolt/rebook";
import { recomputeDeliveryCost } from "@/lib/delivery/mark-order-delivered";
import { escapeTelegramHtml, sendTelegramMessage } from "@/lib/telegram";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Bolt ride reconciliation.
 *
 * Fired every 5 minutes by the reconcile-bolt-rides edge function (pg_cron —
 * see migration 096). Covers the three ways the happy path can fall down:
 *
 *   1. A webhook never arrived, so a ride is stuck mid-flight.
 *   2. A ride completed but its receipt wasn't ready yet, so the order is
 *      delivered with no cost recorded.
 *   3. Booking died between claiming the order and writing a ride row.
 *
 * Only ever touches rides we booked. A ride booked by hand has no ride_id we
 * could query — those stay on the manual lane by design.
 */

/** Don't race the webhook; give it first crack. */
const MIN_AGE_MINUTES = 3;
/** Bolt says a receipt can take 24h+ under review. Past this, ask a human. */
const RECEIPT_GIVE_UP_HOURS = 48;
/** Booking should take seconds; this long means it died mid-flight. */
const STUCK_BOOKING_MINUTES = 10;
const BATCH_LIMIT = 50;

/** Statuses an undelivered platform-lane order can legitimately sit in. */
const OPEN_DELIVERY_STATUSES = [
  "confirmed",
  "preparing",
  "ready_for_pickup",
  "assigned_to_rider",
  "in_transit",
];

function isAuthorized(request: NextRequest): boolean {
  const provided = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const envOf = (row: { environment: string }): BoltEnvironment =>
  row.environment === "production" ? "production" : "sandbox";

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const cutoff = new Date(Date.now() - MIN_AGE_MINUTES * 60 * 1000).toISOString();

  const summary = { polled: 0, advanced: 0, receipts: 0, stuck: 0, errors: 0 };

  /* ── 1. Rides still in flight ──────────────────────────────────────────── */
  const { data: activeRows } = await supabase
    .from("bolt_rides")
    .select("id, order_id, restaurant_id, attempt, bolt_ride_id, state, fare_kobo, environment, tracking_url")
    .not("bolt_ride_id", "is", null)
    .not("state", "in", "(COMPLETED,CANCELLED,CLIENT_CANCELLED,CLIENT_DID_NOT_SHOW,NO_DRIVER_FOUND,PAYMENT_BOOKING_FAILED,CREATE_FAILED,SHADOW)")
    .lte("updated_at", cutoff)
    .order("updated_at", { ascending: true })
    .limit(BATCH_LIMIT);

  for (const row of (activeRows as BoltRideRow[] | null) ?? []) {
    summary.polled++;
    try {
      const env = envOf(row);
      const details = await getRideDetails(env, row.bolt_ride_id!);
      if (details.state === row.state) continue;

      const result = await applyRideState(supabase, row, details, env);
      summary.advanced++;

      if (result.action === "failed") {
        await handleFailedRide(supabase, {
          orderId: row.order_id,
          attempt: row.attempt,
          failedState: result.state,
        });
      }
    } catch (err) {
      summary.errors++;
      console.error(`[bolt-reconcile] poll failed ride=${row.bolt_ride_id}:`, err);
    }
  }

  /* ── 2. Rides still missing a fare — completed OR failed ─────────────────
   * Bolt's receipt format has a `cancellation_fee` line item: a ride that
   * never completed (a driver bailing, a no-show at pickup) can still carry a
   * real cost. recomputeDeliveryCost already sums ANY bolt_rides row with a
   * fare, regardless of state — so the only gap was that nothing ever fetched
   * a receipt for a failed ride in the first place. This closes that by
   * sweeping the failed terminal states here too, not just COMPLETED.
   *
   * The 48h "receipt missing" alert below stays COMPLETED-only. For a
   * completed ride a receipt is always expected eventually, so silence past
   * 48h is anomalous and worth paging. For a cancelled / no-driver-found ride,
   * NO fee is the normal outcome, not an anomaly — alerting on that would page
   * the group for every ordinary fee-free cancellation. The fetch itself still
   * retries forever either way (cheap), so a late-arriving fee is still caught.
   */
  const { data: awaitingReceipt } = await supabase
    .from("bolt_rides")
    .select("id, order_id, bolt_ride_id, state, completed_at, cancelled_at, environment, last_error")
    .in("state", ["COMPLETED", ...BOLT_FAILED_STATES])
    .is("fare_kobo", null)
    .not("bolt_ride_id", "is", null)
    .order("completed_at", { ascending: true })
    .limit(BATCH_LIMIT);

  for (const row of (awaitingReceipt as
    | {
        id: string;
        order_id: string;
        bolt_ride_id: number;
        state: string;
        completed_at: string | null;
        cancelled_at: string | null;
        environment: string;
        last_error: string | null;
      }[]
    | null) ?? []) {
    try {
      const receipt = await getRideReceipt(envOf(row), row.bolt_ride_id);
      if (typeof receipt?.amount !== "number") continue;

      await supabase
        .from("bolt_rides")
        .update({
          fare_kobo: toKobo(receipt.amount),
          currency_code: receipt.currency_code ?? null,
          invoice_url: receipt.invoice_url ?? null,
          fare_breakdown: receipt.fare_breakdown ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);

      await recomputeDeliveryCost(supabase, row.order_id);
      summary.receipts++;
    } catch {
      // Only escalate for COMPLETED — see the comment above this block for why
      // a failed ride staying fee-free forever is the expected case, not one
      // that should ever page anyone.
      if (row.state !== "COMPLETED") continue;

      // Still under review. Keep chasing until it's clearly never coming, then
      // alert exactly once — last_error being set is the "already told them"
      // marker, without which this would page the group every 5 minutes.
      const ageMs = row.completed_at ? Date.now() - new Date(row.completed_at).getTime() : 0;
      if (ageMs > RECEIPT_GIVE_UP_HOURS * 60 * 60 * 1000 && !row.last_error) {
        await supabase
          .from("bolt_rides")
          .update({
            last_error: `receipt still unavailable after ${RECEIPT_GIVE_UP_HOURS}h`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        await sendTelegramMessage(
          `⚠️ <b>Bolt receipt missing</b>\n` +
            `Ride ${escapeTelegramHtml(row.bolt_ride_id)} completed over ${RECEIPT_GIVE_UP_HOURS}h ago ` +
            `with no receipt. Enter the cost manually on the Riders page.`
        );
      }
    }
  }

  /* ── 3. Bookings that died mid-flight ──────────────────────────────────── */
  const stuckCutoff = new Date(Date.now() - STUCK_BOOKING_MINUTES * 60 * 1000).toISOString();
  const { data: claimedOrders } = await supabase
    .from("orders")
    .select("id, order_number, restaurant_id, bolt_booking_claimed_at")
    // Since migration 101 a rider is sought while the food may still be
    // cooking, so an order awaiting one is no longer identifiable by a single
    // status. 'assigned_to_rider' is kept for orders dispatched before 101.
    .in("status", OPEN_DELIVERY_STATUSES)
    .not("bolt_booking_claimed_at", "is", null)
    .lte("bolt_booking_claimed_at", stuckCutoff)
    .limit(BATCH_LIMIT);

  for (const order of (claimedOrders as
    | {
        id: string;
        order_number: string | number;
        restaurant_id: string;
        bolt_booking_claimed_at: string;
      }[]
    | null) ?? []) {
    const { count } = await supabase
      .from("bolt_rides")
      .select("id", { count: "exact", head: true })
      .eq("order_id", order.id);

    if ((count ?? 0) > 0) continue;

    // Claimed but never recorded an attempt: the process died between the two.
    // Write the failed attempt rather than only alerting — it puts the order in
    // the Riders console's needs-attention list, and it means the next cron run
    // sees a row here and doesn't re-alert. Without it this pages every 5 min.
    summary.stuck++;
    await supabase.from("bolt_rides").insert({
      order_id: order.id,
      restaurant_id: order.restaurant_id,
      attempt: 1,
      state: "CREATE_FAILED",
      last_error: `booking claimed but never created a ride (abandoned after ${STUCK_BOOKING_MINUTES}m)`,
    });

    await sendTelegramMessage(
      `⚠️ <b>Booking never completed</b>\n` +
        `Order #${escapeTelegramHtml(order.order_number)} was claimed for booking ` +
        `over ${STUCK_BOOKING_MINUTES} minutes ago but no ride was ever created. ` +
        `Book it from the Riders page.`
    );
  }

  console.log("[bolt-reconcile]", JSON.stringify(summary));
  return NextResponse.json({ ok: true, ...summary });
}
