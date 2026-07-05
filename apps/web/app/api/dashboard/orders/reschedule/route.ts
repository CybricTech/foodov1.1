import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getRequestUser } from "@/lib/supabase/get-request-user";
import { getPostHogClient } from "@/lib/posthog";
import {
  normalizeSchedulingSettings,
  isValidScheduleSlot,
  type OpeningHours,
} from "@foodo/utils";

/**
 * Move a not-yet-activated scheduled order to a different slot. The new slot
 * is validated with the SAME shared util the storefront/checkout use, then
 * the customer is told by SMS (order_rescheduled). Resets the merchant
 * "slot approaching" alert so it re-fires for the new time.
 * Bearer-or-cookie auth, same convention as update-status/dispatch.
 */
export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  const { data: callerProfile } = await supabase
    .from("user_profiles")
    .select("role, restaurant_id")
    .eq("id", user.id)
    .single();

  if (
    !callerProfile ||
    !["merchant_owner", "merchant_staff"].includes(callerProfile.role)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const restaurantId = callerProfile.restaurant_id;
  if (!restaurantId) {
    return NextResponse.json(
      { error: "No restaurant associated with this account" },
      { status: 400 }
    );
  }

  let body: { orderId?: string; scheduledFor?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { orderId, scheduledFor, reason } = body;
  if (!orderId || typeof orderId !== "string") {
    return NextResponse.json({ error: "orderId is required" }, { status: 400 });
  }
  if (!scheduledFor || typeof scheduledFor !== "string") {
    return NextResponse.json({ error: "scheduledFor is required" }, { status: 400 });
  }
  const newSlot = new Date(scheduledFor);
  if (Number.isNaN(newSlot.getTime())) {
    return NextResponse.json({ error: "Invalid scheduledFor" }, { status: 400 });
  }

  const [{ data: order }, { data: restaurantRow }] = await Promise.all([
    supabase
      .from("orders")
      .select("id, status, scheduled_for, activated_at, customer_phone, order_number")
      .eq("id", orderId)
      .eq("restaurant_id", restaurantId)
      .single(),
    supabase
      .from("restaurants")
      .select("opening_hours, scheduling_settings")
      .eq("id", restaurantId)
      .single() as unknown as Promise<{ data: Record<string, unknown> | null }>,
  ]);

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const o = order as unknown as {
    status: string;
    scheduled_for: string | null;
    activated_at: string | null;
    customer_phone: string | null;
    order_number: string;
  };
  if (!o.scheduled_for || o.activated_at) {
    return NextResponse.json(
      { error: "Only scheduled orders that haven't started can be rescheduled" },
      { status: 400 }
    );
  }
  if (o.status === "cancelled") {
    return NextResponse.json({ error: "This order was cancelled" }, { status: 400 });
  }

  // Validate against the shared slot rules. Note: `enabled` is deliberately
  // NOT required here — a merchant who has since paused pre-orders must still
  // be able to manage the bookings that already exist.
  const schedulingSettings = normalizeSchedulingSettings(
    restaurantRow?.["scheduling_settings"]
  );
  const valid = isValidScheduleSlot({
    openingHours: (restaurantRow?.["opening_hours"] ?? null) as OpeningHours | null,
    schedulingSettings,
    scheduledFor: newSlot,
  });
  if (!valid) {
    return NextResponse.json(
      { error: "That slot isn't available — pick a time within your opening hours and booking window" },
      { status: 422 }
    );
  }

  // Recompute the ready estimate from the NEW slot + the longest item prep
  // (mirrors how the webhook derives it at creation).
  const { data: orderItems } = await supabase
    .from("order_items")
    .select("menu_items (prep_time_minutes)")
    .eq("order_id", orderId);
  const prepTimes = (orderItems ?? [])
    .map(
      (r) =>
        (r as unknown as { menu_items?: { prep_time_minutes: number | null } | null })
          .menu_items?.prep_time_minutes
    )
    .filter((p): p is number => typeof p === "number" && p > 0);
  const maxPrepMinutes = prepTimes.length > 0 ? Math.max(...prepTimes) : 20;

  const { error: updateError } = await supabase
    .from("orders")
    .update({
      scheduled_for: newSlot.toISOString(),
      // New slot → the "slot approaching" merchant alert must re-fire.
      scheduled_alert_sent_at: null,
      estimated_delivery_at: new Date(
        newSlot.getTime() + maxPrepMinutes * 60_000
      ).toISOString(),
    } as never)
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId);

  if (updateError) {
    console.error("[api/dashboard/orders/reschedule] error:", updateError.message);
    return NextResponse.json(
      { error: "Failed to reschedule the order" },
      { status: 500 }
    );
  }

  // Tell the customer (fire-and-forget, but awaited so serverless completes it).
  if (o.customer_phone) {
    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-sms`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        restaurantId,
        phone: o.customer_phone,
        eventType: "order_rescheduled",
        orderId,
        orderNumber: o.order_number,
        scheduledFor: newSlot.toISOString(),
        ...(reason?.trim() ? { reason: reason.trim().slice(0, 200) } : {}),
      }),
    }).catch(console.error);
  }

  const posthog = getPostHogClient();
  posthog.capture({
    distinctId: user.id,
    event: "scheduled order rescheduled",
    properties: {
      order_id: orderId,
      restaurant_id: restaurantId,
      previous_slot: o.scheduled_for,
      new_slot: newSlot.toISOString(),
    },
  });
  await posthog.shutdown();

  return NextResponse.json({ success: true, scheduledFor: newSlot.toISOString() });
}
