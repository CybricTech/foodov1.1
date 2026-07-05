import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getRequestUser } from "@/lib/supabase/get-request-user";
import { getPostHogClient } from "@/lib/posthog";

/**
 * Decline a not-yet-activated scheduled order. Kept separate from the queue's
 * generic direct-client cancel specifically because declining a booking has a
 * server-side SMS side effect (order_declined, with the merchant's reason)
 * the generic cancel path doesn't have.
 *
 * Refund note: like every cancellation today, the refund is a manual,
 * admin-driven process — this route only cancels + notifies.
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

  let body: { orderId?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { orderId } = body;
  const reason = body.reason?.trim();
  if (!orderId || typeof orderId !== "string") {
    return NextResponse.json({ error: "orderId is required" }, { status: 400 });
  }
  if (!reason) {
    return NextResponse.json({ error: "A reason is required" }, { status: 400 });
  }

  const { data: order } = await supabase
    .from("orders")
    .select("id, status, scheduled_for, activated_at, customer_phone, order_number")
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .single();

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
      { error: "Only scheduled orders that haven't started can be declined here" },
      { status: 400 }
    );
  }
  if (o.status === "cancelled") {
    return NextResponse.json(
      { error: "This order was already cancelled" },
      { status: 400 }
    );
  }

  const { error: updateError } = await supabase
    .from("orders")
    .update({
      status: "cancelled",
      cancellation_reason: reason.slice(0, 200),
    })
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId);

  if (updateError) {
    console.error("[api/dashboard/orders/decline-scheduled] error:", updateError.message);
    return NextResponse.json(
      { error: "Failed to decline the order" },
      { status: 500 }
    );
  }

  // Tell the customer (awaited so serverless doesn't kill the dispatch).
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
        eventType: "order_declined",
        orderId,
        orderNumber: o.order_number,
        reason: reason.slice(0, 200),
      }),
    }).catch(console.error);
  }

  const posthog = getPostHogClient();
  posthog.capture({
    distinctId: user.id,
    event: "scheduled order declined",
    properties: {
      order_id: orderId,
      restaurant_id: restaurantId,
      scheduled_for: o.scheduled_for,
      reason,
    },
  });
  await posthog.shutdown();

  return NextResponse.json({ success: true });
}
