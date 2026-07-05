import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getPostHogClient } from "@/lib/posthog";
import {
  normalizeSchedulingSettings,
  canSelfCancelScheduledOrder,
} from "@foodo/utils";

/**
 * Customer self-cancel for a SCHEDULED order that hasn't entered the live
 * queue. Public route — knowledge of the order UUID is the only "auth",
 * identical to the order-tracking page's security model (which fetches the
 * order directly by id with no session).
 *
 * Server-enforced guard: only before `scheduled_for − self_cancel_cutoff`,
 * and only while the order is still pending activation. Refunds stay manual
 * and admin-driven, exactly like every other cancellation on the platform.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { order_id: string } }
) {
  const orderId = params.order_id;
  if (!orderId) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const supabase = createServiceClient();

  const { data: order } = await supabase
    .from("orders")
    .select("id, restaurant_id, status, scheduled_for, activated_at, customer_phone")
    .eq("id", orderId)
    .single();

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const o = order as unknown as {
    restaurant_id: string;
    status: string;
    scheduled_for: string | null;
    activated_at: string | null;
  };

  if (!o.scheduled_for) {
    return NextResponse.json(
      { error: "Only scheduled orders can be cancelled here" },
      { status: 400 }
    );
  }
  if (o.status === "cancelled") {
    return NextResponse.json({ success: true, alreadyCancelled: true });
  }
  if (o.activated_at || !["pending", "confirmed"].includes(o.status)) {
    return NextResponse.json(
      { error: "This order is already being prepared and can no longer be cancelled" },
      { status: 409 }
    );
  }

  const { data: restaurantRow } = (await supabase
    .from("restaurants")
    .select("scheduling_settings")
    .eq("id", o.restaurant_id)
    .single()) as unknown as { data: Record<string, unknown> | null };

  const schedulingSettings = normalizeSchedulingSettings(
    restaurantRow?.["scheduling_settings"]
  );

  if (
    !canSelfCancelScheduledOrder(new Date(o.scheduled_for), schedulingSettings)
  ) {
    return NextResponse.json(
      {
        error: `It's too close to your slot to cancel online (cutoff is ${schedulingSettings.self_cancel_cutoff_minutes} minutes before). Please call the restaurant.`,
      },
      { status: 409 }
    );
  }

  // Guarded update: only flips while still pending activation, so a racing
  // activation cron / pull-forward can't be overridden by a late cancel.
  const { data: cancelled, error: updateError } = await supabase
    .from("orders")
    .update({
      status: "cancelled",
      cancellation_reason: "Cancelled by customer",
    })
    .eq("id", orderId)
    .is("activated_at" as never, null)
    .in("status", ["pending", "confirmed"])
    .select("id")
    .maybeSingle();

  if (updateError) {
    console.error("[api/orders/cancel] error:", updateError.message);
    return NextResponse.json(
      { error: "Failed to cancel the order" },
      { status: 500 }
    );
  }
  if (!cancelled) {
    return NextResponse.json(
      { error: "This order is already being prepared and can no longer be cancelled" },
      { status: 409 }
    );
  }

  const posthog = getPostHogClient();
  posthog.capture({
    distinctId: (order as unknown as { customer_phone?: string }).customer_phone ?? orderId,
    event: "scheduled order self-cancelled",
    properties: {
      order_id: orderId,
      restaurant_id: o.restaurant_id,
      scheduled_for: o.scheduled_for,
    },
  });
  await posthog.shutdown();

  return NextResponse.json({ success: true });
}
