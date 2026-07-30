import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getRequestUser } from "@/lib/supabase/get-request-user";
import { requestRiderForOrder } from "@/lib/delivery/request-rider";
import { commitDeliverySplit } from "@/lib/delivery/commit-delivery-split";
import { laneForPolicy, resolveDispatchPolicy } from "@foodo/utils";

/**
 * POST /api/dashboard/orders/dispatch
 *
 * The merchant choosing who takes a ready delivery order.
 *
 * Since migration 101 this is only one of four ways an order can get a rider,
 * and the narrowest: it exists for HYBRID merchants, who decide per order.
 *
 *   platform  the rider is requested by the T−10 cron or by Mark Ready, not
 *             here — this route only accepts platform_rider for them as a
 *             belt-and-braces path if a stale client posts it, and even then it
 *             just calls the same chokepoint the cron does.
 *   in_house  only own_rider is legal; asking us for a rider is rejected.
 *   hybrid    both, exactly as before.
 *
 * The platform lane no longer sets status = 'assigned_to_rider'. orders.status
 * follows the food and orders.dispatch_state follows the rider, because a rider
 * can now be en route while the food is still cooking — and the old status flip
 * locked the merchant out of their own Mark Ready button.
 *
 * Body: { order_id: string, dispatch_type: "platform_rider" | "own_rider" }
 */
export async function POST(request: NextRequest) {
  // Auth check — accepts a mobile Bearer token OR the web cookie session.
  const user = await getRequestUser(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceClient = createServiceClient();

  // Verify user is merchant_owner or merchant_staff
  const { data: profile } = await serviceClient
    .from("user_profiles")
    .select("role, restaurant_id")
    .eq("id", user.id)
    .single();

  if (
    !profile ||
    !profile.restaurant_id ||
    !["merchant_owner", "merchant_staff"].includes(profile.role)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { order_id, dispatch_type } = body as {
    order_id?: string;
    dispatch_type?: string;
  };

  if (!order_id || !dispatch_type) {
    return NextResponse.json(
      { error: "order_id and dispatch_type are required" },
      { status: 400 }
    );
  }

  if (!["platform_rider", "own_rider"].includes(dispatch_type)) {
    return NextResponse.json(
      { error: "dispatch_type must be 'platform_rider' or 'own_rider'" },
      { status: 400 }
    );
  }

  // Verify the order belongs to this merchant's restaurant and is ready
  const { data: order, error: orderErr } = await serviceClient
    .from("orders")
    .select(
      "id, order_number, restaurant_id, status, fulfillment_type, delivery_fee_kobo, customer_phone"
    )
    .eq("id", order_id)
    .eq("restaurant_id", profile.restaurant_id)
    .single();

  if (orderErr || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (order.status !== "ready_for_pickup") {
    return NextResponse.json(
      { error: "Order must be in ready_for_pickup status" },
      { status: 400 }
    );
  }

  if (order.fulfillment_type !== "delivery") {
    return NextResponse.json(
      { error: "Only delivery orders need dispatch assignment" },
      { status: 400 }
    );
  }

  /* ── Policy gate ─────────────────────────────────────────────────────────
   * The merchant's policy decides which choices exist at all. A stale client —
   * a cached dashboard tab, an old mobile build — must not be able to post the
   * lane the merchant is no longer on, because the lane decides who pays for
   * the delivery.
   */
  const { data: restaurantData } = await serviceClient
    .from("restaurants")
    .select("dispatch_policy")
    .eq("id", profile.restaurant_id)
    .single();

  const policy = resolveDispatchPolicy(
    (restaurantData as { dispatch_policy: string | null } | null)?.dispatch_policy
  );
  const fixedLane = laneForPolicy(policy);

  if (fixedLane !== null && fixedLane !== dispatch_type) {
    return NextResponse.json(
      {
        error:
          policy === "in_house"
            ? "Your store handles its own deliveries. Switch your dispatch setting to Platform or Hybrid to request a Kitchyn rider."
            : "Your store is set to Kitchyn delivery — a rider is requested automatically before the food is ready.",
        policy,
      },
      { status: 409 }
    );
  }

  /* ── Platform lane ───────────────────────────────────────────────────────
   * One chokepoint, shared with the T−10 cron and Mark Ready. It owns the
   * idempotency latch, the lane commit, the delivery split and the Bolt/Telegram
   * decision — so a hybrid merchant clicking this gets byte-identical treatment
   * to a platform merchant whose timer fired.
   */
  if (dispatch_type === "platform_rider") {
    const result = await requestRiderForOrder(
      serviceClient,
      order_id,
      "dispatch:picker",
      { lane: "platform_rider" }
    );

    if (result.outcome === "failed") {
      return NextResponse.json({ error: result.reason }, { status: 500 });
    }

    // 'skipped' means a rider was already requested — the timer beat the click,
    // or the merchant double-tapped. Both are success from here.
    return NextResponse.json({
      ok: true,
      status: order.status,
      dispatch_type,
      dispatch_state: "requested",
      existing: result.outcome === "skipped",
    });
  }

  /* ── In-house lane ───────────────────────────────────────────────────────
   * The merchant's own rider is leaving with the food right now, so unlike the
   * platform lane this really is an in_transit transition and the customer's
   * "on its way" SMS really is true at this moment.
   */
  const { data: existing } = await serviceClient
    .from("delivery_assignments")
    .select("id")
    .eq("order_id", order_id)
    .limit(1);

  const alreadyAssigned = Boolean(existing && existing.length > 0);

  if (!alreadyAssigned) {
    const { error: assignErr } = await serviceClient
      .from("delivery_assignments")
      .insert({
        order_id,
        restaurant_id: profile.restaurant_id,
        dispatch_type,
        rider_id: null,
        status: "assigned",
      });

    // 23505 = a concurrent dispatch already created it. Idempotent, carry on.
    if (assignErr && (assignErr as { code?: string }).code !== "23505") {
      return NextResponse.json({ error: assignErr.message }, { status: 500 });
    }

    const split = await commitDeliverySplit(serviceClient, {
      orderId: order_id,
      restaurantId: order.restaurant_id,
      orderNumber: order.order_number,
      deliveryFeeKobo: order.delivery_fee_kobo ?? 0,
      dispatchType: dispatch_type,
    });

    if (split.outcome === "error") {
      return NextResponse.json({ error: split.reason }, { status: 500 });
    }
  }

  const { error: statusErr } = await serviceClient
    .from("orders")
    .update({
      status: "in_transit",
      dispatch_type,
      // The merchant's own rider needs nothing from us.
      dispatch_state: "not_required",
    })
    .eq("id", order_id);

  if (statusErr) {
    return NextResponse.json({ error: statusErr.message }, { status: 500 });
  }

  // Fired once, on first dispatch only — a re-dispatch must not re-text.
  if (!alreadyAssigned && order.customer_phone) {
    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-sms`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        restaurantId: profile.restaurant_id,
        phone: order.customer_phone,
        eventType: "order_in_transit",
        orderId: order_id,
        orderNumber: order.order_number,
      }),
    }).catch(console.error);
  }

  return NextResponse.json({
    ok: true,
    status: "in_transit",
    dispatch_type,
    existing: alreadyAssigned,
  });
}
