import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getRequestUser } from "@/lib/supabase/get-request-user";
import { sendTelegramRiderAlert } from "@/lib/telegram";
import { getPostHogClient } from "@/lib/posthog";

const VALID_STATUSES = [
  "pending",
  "confirmed",
  "preparing",
  "ready_for_pickup",
  "assigned_to_rider",
  "in_transit",
  "ready",
  "delivered",
  "completed",
  "cancelled",
];

export async function POST(req: NextRequest) {
  // Auth check — accepts a mobile Bearer token OR the web cookie session.
  const user = await getRequestUser(req);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceClient = createServiceClient();

  // Verify caller is merchant_owner or merchant_staff
  const { data: callerProfile } = await serviceClient
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

  // Parse body
  let body: { orderId?: string; status?: string; estimatedReadyMinutes?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { orderId, status, estimatedReadyMinutes } = body;

  if (!orderId || typeof orderId !== "string") {
    return NextResponse.json(
      { error: "orderId is required" },
      { status: 400 }
    );
  }

  if (!status || !VALID_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` },
      { status: 400 }
    );
  }

  // Look up the order so we can enforce the platform-rider rule:
  // once an order is being handled by a Foodo platform rider, only the admin
  // riders page may complete it. Merchants can manage everything else.
  const { data: order, error: lookupError } = await serviceClient
    .from("orders")
    .select("id, dispatch_type, status, fulfillment_type, customer_phone, order_number")
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .single();

  if (lookupError || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const PLATFORM_RIDER_LOCKED_TARGETS = new Set(["in_transit", "delivered", "completed"]);
  if (
    order.dispatch_type === "platform_rider" &&
    PLATFORM_RIDER_LOCKED_TARGETS.has(status)
  ) {
    return NextResponse.json(
      {
        error:
          "This order is assigned to a Foodo platform rider. Only the admin riders page can mark it delivered.",
      },
      { status: 403 }
    );
  }

  // When the merchant confirms an order they may adjust the estimated-ready time
  // (the modal pre-fills the computed default from item prep times). We store it
  // as the order's ETA — the "ready" time only, with no delivery travel buffer:
  // deliveries go out with 3rd-party riders whose timing we can't control, so
  // the customer is shown a ready estimate, not a delivery ETA. Clamped to a
  // sane 1–240 minutes. Applied on whichever transition first accepts the order:
  // the web owner queue sends it on "confirmed", the mobile/frontline kanban on
  // "preparing". Gate on the value being present, not the target status.
  const updatePayload: { status: string; estimated_delivery_at?: string } = { status };
  if (
    typeof estimatedReadyMinutes === "number" &&
    Number.isFinite(estimatedReadyMinutes)
  ) {
    const readyMinutes = Math.min(240, Math.max(1, Math.round(estimatedReadyMinutes)));
    updatePayload.estimated_delivery_at = new Date(
      Date.now() + readyMinutes * 60 * 1000
    ).toISOString();
  }

  // Update the order — only allow updating orders that belong to this restaurant
  const { error: updateError } = await serviceClient
    .from("orders")
    .update(updatePayload)
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId);

  if (updateError) {
    console.error("[api/dashboard/orders/update-status] error:", updateError.message);
    return NextResponse.json(
      { error: "Failed to update order status" },
      { status: 500 }
    );
  }

  // Telegram alert when an order transitions into assigned_to_rider.
  // Fires here as a safety net for any path that bypasses the dispatch route.
  if (status === "assigned_to_rider" && order.status !== "assigned_to_rider") {
    const { data: orderRow } = await serviceClient
      .from("orders")
      .select("order_number")
      .eq("id", orderId)
      .single();
    if (orderRow?.order_number) {
      await sendTelegramRiderAlert(
        serviceClient,
        orderId,
        restaurantId,
        orderRow.order_number,
        "status-update"
      ).catch(console.error);
    }
  }

  // Customer "order ready for pickup" SMS — only for pickup orders, only on the
  // first transition into ready_for_pickup (skip if it was already in that state).
  if (
    status === "ready_for_pickup" &&
    order.status !== "ready_for_pickup" &&
    order.fulfillment_type === "pickup" &&
    order.customer_phone
  ) {
    await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-sms`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          restaurantId,
          phone: order.customer_phone,
          eventType: "order_ready",
          orderId,
          orderNumber: order.order_number,
        }),
      }
    ).catch(console.error);
  }

  const posthog = getPostHogClient();
  posthog.capture({
    distinctId: user.id,
    event: "order status updated",
    properties: {
      order_id: orderId,
      restaurant_id: restaurantId,
      previous_status: order.status,
      new_status: status,
      fulfillment_type: order.fulfillment_type,
    },
  });
  await posthog.shutdown();

  return NextResponse.json({ success: true });
}
