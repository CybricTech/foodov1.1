import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requestRiderForOrder } from "@/lib/delivery/request-rider";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Time-driven rider requests — the T−10 tick.
 *
 * Fired every minute by the request-due-riders edge function (pg_cron, see
 * migration 102). Finds platform-policy delivery orders whose food is nearly
 * ready and asks for a rider, so the ride is found and driving to the store
 * while the last few minutes of cooking happen, instead of afterwards.
 *
 * Does almost nothing itself. Every order goes through requestRiderForOrder,
 * the same chokepoint the merchant's Mark Ready and the hybrid picker use, so
 * the idempotency latch, the lane commit, the delivery split and the
 * Bolt-vs-Telegram decision have exactly one implementation.
 *
 * ── Load discipline ────────────────────────────────────────────────────────
 * Migration 062: mark_late_orders overlapping itself exhausted the 60-connection
 * Micro instance and took auth down with it. So this runs one indexed query
 * against orders_rider_request_due (a partial index over an already-tiny set),
 * caps the batch, wraps each order individually so one bad row can't abort the
 * run, and returns fast. No advisory lock — the batch cap is the bound.
 *
 * ── Testing ────────────────────────────────────────────────────────────────
 * Nobody should have to wait 35 minutes to test a countdown:
 *
 *   { "dry_run": true }               what WOULD be requested; claims nothing
 *   { "order_ids": ["<uuid>", ...] }  scope a run to specific orders
 *
 * and rider_request_due_at is a plain column, so
 * `UPDATE orders SET rider_request_due_at = now() WHERE id = …` fires any order
 * on the next tick without touching the customer-facing ETA.
 */

/** Bounded so a backlog can't hold a serverless invocation open. */
const BATCH_LIMIT = 50;

/**
 * How far back to look. An order whose due time passed hours ago is not a
 * dispatch problem any more — the kitchen fell over, or the platform was down —
 * and quietly buying it a ride now would put a rider outside a restaurant that
 * has probably closed. Those surface on the Riders page instead.
 */
const MAX_OVERDUE_MINUTES = 90;

function isAuthorized(request: NextRequest): boolean {
  const provided = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

interface DueOrderRow {
  id: string;
  order_number: string | number;
  restaurant_id: string;
  status: string;
  rider_request_due_at: string;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { dry_run?: boolean; order_ids?: string[] } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    // pg_cron posts '{}'; a body is optional.
  }

  const dryRun = body.dry_run === true;
  const supabase = createServiceClient();

  /* ── Master switch ───────────────────────────────────────────────────────
   * FALSE means riders are requested where they always were — at the merchant's
   * dispatch click. This is the one lever that returns the whole platform to
   * pre-101 behaviour, so it is checked before anything else happens.
   */
  const { data: settingsRow } = await supabase
    .from("platform_settings")
    .select("timed_rider_request_enabled")
    .single();

  const enabled =
    (settingsRow as { timed_rider_request_enabled?: boolean } | null)
      ?.timed_rider_request_enabled ?? false;

  if (!enabled && !dryRun) {
    return NextResponse.json({ ok: true, disabled: true, requested: 0 });
  }

  /* ── The scan ────────────────────────────────────────────────────────────
   * Rides the partial index orders_rider_request_due exactly: due time set,
   * not yet requested. The status filter is a correctness guard, not the
   * selector — cancelled orders have their due time cleared on cancellation,
   * this is the belt to that braces.
   */
  const now = Date.now();
  const floor = new Date(now - MAX_OVERDUE_MINUTES * 60_000).toISOString();

  let query = supabase
    .from("orders")
    .select("id, order_number, restaurant_id, status, rider_request_due_at")
    .is("rider_requested_at", null)
    .not("rider_request_due_at", "is", null)
    .lte("rider_request_due_at", new Date(now).toISOString())
    .gte("rider_request_due_at", floor)
    .eq("fulfillment_type", "delivery")
    .in("status", ["confirmed", "preparing", "ready_for_pickup"])
    .order("rider_request_due_at", { ascending: true })
    .limit(BATCH_LIMIT);

  if (body.order_ids?.length) {
    query = query.in("id", body.order_ids);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[request-due-riders] scan failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const due = (data as DueOrderRow[] | null) ?? [];

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dry_run: true,
      timed_request_enabled: enabled,
      count: due.length,
      would_request: due.map((o) => ({
        order_id: o.id,
        order_number: o.order_number,
        status: o.status,
        due_at: o.rider_request_due_at,
        overdue_seconds: Math.round(
          (now - new Date(o.rider_request_due_at).getTime()) / 1000
        ),
      })),
    });
  }

  const summary = {
    scanned: due.length,
    requested: 0,
    skipped: 0,
    not_applicable: 0,
    failed: 0,
  };

  // Sequential on purpose. Each iteration books a ride and moves money; a
  // parallel fan-out would multiply peak connections against the very instance
  // limit migration 062 was written about, to save seconds nobody is waiting on.
  for (const order of due) {
    try {
      const result = await requestRiderForOrder(supabase, order.id, "cron:due");
      switch (result.outcome) {
        case "requested":
          summary.requested++;
          break;
        case "skipped":
          summary.skipped++;
          break;
        case "not_applicable":
          summary.not_applicable++;
          // Nothing will ever come of this order's timer; stop re-scanning it.
          await supabase
            .from("orders")
            .update({ rider_request_due_at: null })
            .eq("id", order.id);
          break;
        case "failed":
          summary.failed++;
          console.error(
            `[request-due-riders] order=${order.order_number}: ${result.reason}`
          );
          break;
      }
    } catch (err) {
      summary.failed++;
      console.error(`[request-due-riders] order=${order.order_number} threw:`, err);
    }
  }

  if (summary.requested > 0 || summary.failed > 0) {
    console.log("[request-due-riders]", JSON.stringify(summary));
  }

  return NextResponse.json({ ok: true, ...summary });
}
