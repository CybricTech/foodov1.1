import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getRequestUser } from "@/lib/supabase/get-request-user";
import { dispatchRideForOrder } from "@/lib/delivery/dispatch-ride";
import {
  readDispatchSettings,
  refreshRiderRequestDueAt,
  requestRiderForOrder,
} from "@/lib/delivery/request-rider";
import { standDownRiderForOrder } from "@/lib/delivery/cancel-rider";
import { getPostHogClient } from "@/lib/posthog";
import {
  isPlatformRiderEngaged,
  policyRequestsPlatformRider,
  resolveDispatchPolicy,
} from "@foodo/utils";
import { readOrderDispatchFields } from "@/lib/delivery/dispatch-fields";

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
    // One string literal, not a concatenation: Supabase infers the row type by
    // parsing this text, and a `"a" + "b"` expression degrades the whole result
    // to GenericStringError.
    .select("id, dispatch_type, status, fulfillment_type, customer_phone, order_number, estimated_delivery_at, rider_requested_at, dispatch_state")
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .single();

  if (lookupError || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // The merchant's dispatch policy governs both of the new behaviours below:
  // when the rider timer is armed, and whether Mark Ready fires early.
  const { data: restaurantData } = await serviceClient
    .from("restaurants")
    .select("dispatch_policy, rider_request_lead_minutes")
    .eq("id", restaurantId)
    .single();

  const restaurant = restaurantData as {
    dispatch_policy: string | null;
    rider_request_lead_minutes: number | null;
  } | null;
  const policy = resolveDispatchPolicy(restaurant?.dispatch_policy);
  const isPlatformPolicy = policyRequestsPlatformRider(policy);

  // Gated on isPlatformRiderEngaged — the SAME predicate the merchant UI uses to
  // decide whether to render a hand-over button at all. It used to test
  // dispatch_type on its own here while the UI also required rider_requested_at,
  // and the gap between the two was a dead end: an order carrying
  // dispatch_type = 'platform_rider' with no rider ever requested (stamped at
  // creation by a free-delivery promo, or by the admin test-order tool) showed a
  // "Hand to Rider" button that this branch answered 403 to, every time, with no
  // other action available. The order could not be advanced by anyone.
  const PLATFORM_RIDER_LOCKED_TARGETS = new Set(["in_transit", "delivered", "completed"]);
  if (isPlatformRiderEngaged(order) && PLATFORM_RIDER_LOCKED_TARGETS.has(status)) {
    return NextResponse.json(
      {
        error:
          "A Kitchyn rider is handling this order. Only the admin riders page can mark it delivered.",
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
      await dispatchRideForOrder(
        serviceClient,
        orderId,
        restaurantId,
        orderRow.order_number,
        "status-update"
      ).catch(console.error);
    }
  }

  /* ── Arm the rider timer ──────────────────────────────────────────────────
   * The merchant has just told us when the food will be ready, so this is the
   * moment we can work out when to go and get a rider. Recomputed on every
   * revision, and a no-op once the request has already gone out.
   */
  if (isPlatformPolicy && updatePayload.estimated_delivery_at) {
    const settings = await readDispatchSettings(serviceClient);
    if (settings.timedRequestEnabled) {
      await refreshRiderRequestDueAt(
        serviceClient,
        orderId,
        {
          fulfillment_type: order.fulfillment_type,
          estimated_delivery_at: updatePayload.estimated_delivery_at,
          rider_requested_at: order.rider_requested_at,
        },
        policy,
        restaurant?.rider_request_lead_minutes,
        settings.leadMinutes
      ).catch((err) =>
        console.error(`[update-status] arming rider timer failed order=${orderId}:`, err)
      );
    }
  }

  /* ── Early ready ──────────────────────────────────────────────────────────
   * "Whichever comes first." The merchant beat their own estimate, and food
   * already cooked is a harder signal than a countdown, so go now. The outer
   * latch inside requestRiderForOrder is what stops this and the T−10 tick from
   * both producing a rider.
   *
   * Deliberately NOT gated on timed_rider_request_enabled: with the timer off,
   * a platform merchant's Mark Ready is the ONLY trigger they have, and losing
   * it would strand the order entirely.
   */
  if (
    isPlatformPolicy &&
    status === "ready_for_pickup" &&
    order.status !== "ready_for_pickup" &&
    order.fulfillment_type === "delivery"
  ) {
    await requestRiderForOrder(serviceClient, orderId, "ready:platform").catch((err) =>
      console.error(`[update-status] early rider request failed order=${orderId}:`, err)
    );
  }

  /* ── Cancellation ─────────────────────────────────────────────────────────
   * Requesting a rider up to a lead time before the food is ready widens the
   * cancel-after-request window from "almost never" to routine. Stand the rider
   * down: cancel the Bolt ride, or tell the Telegram group not to book it.
   */
  if (status === "cancelled" && order.status !== "cancelled") {
    await standDownRiderForOrder(serviceClient, orderId, user.id).catch((err) =>
      console.error(`[update-status] stand-down failed order=${orderId}:`, err)
    );
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

  // Echo the rider track back. Mark Ready at a platform merchant requests a
  // rider from inside this very request, so without this the client would render
  // a stale "Hand to Rider" button over an order that already has one coming.
  const dispatch = await readOrderDispatchFields(serviceClient, orderId);

  return NextResponse.json({ success: true, ...(dispatch ? { dispatch } : {}) });
}
