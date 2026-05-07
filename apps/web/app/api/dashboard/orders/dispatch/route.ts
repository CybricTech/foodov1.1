import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";
import { sendTelegramRiderAlert } from "@/lib/telegram";

/**
 * POST /api/dashboard/orders/dispatch
 *
 * Called when the merchant picks a delivery method for a ready order.
 * Creates a delivery_assignments record and updates the order status.
 *
 * Body: { order_id: string, dispatch_type: "platform_rider" | "own_rider" }
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
    .select("id, order_number, restaurant_id, status, fulfillment_type, delivery_fee_kobo")
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

  // Check for existing assignment (idempotency)
  const { data: existing } = await serviceClient
    .from("delivery_assignments")
    .select("id")
    .eq("order_id", order_id)
    .limit(1);

  if (existing && existing.length > 0) {
    // Already assigned — just refresh the order status, leave wallet alone
    const newStatus = dispatch_type === "platform_rider" ? "assigned_to_rider" : "in_transit";
    await serviceClient
      .from("orders")
      .update({ status: newStatus, dispatch_type })
      .eq("id", order_id);

    return NextResponse.json({ ok: true, status: newStatus, existing: true });
  }

  // Create delivery assignment record
  const { error: assignErr } = await serviceClient
    .from("delivery_assignments")
    .insert({
      order_id,
      restaurant_id: profile.restaurant_id,
      dispatch_type,
      rider_id: null, // Will be assigned later for platform_rider
      status: "assigned",
    });

  if (assignErr) {
    return NextResponse.json({ error: assignErr.message }, { status: 500 });
  }

  // ── Delivery-fee split (deferred from payment time) ──────────────────────────
  // Now that we know the actual dispatch type, write the wallet rows that the
  // paystack webhook intentionally skipped. This is idempotent: skip if a
  // logistics_fee row already exists for this order (legacy orders created
  // under the old code path that locked the split at payment time).
  const deliveryFeeKobo = order.delivery_fee_kobo ?? 0;

  if (deliveryFeeKobo > 0) {
    const { data: existingLogistics } = await serviceClient
      .from("wallet_transactions")
      .select("id")
      .eq("order_id", order_id)
      .eq("type", "logistics_fee")
      .limit(1);

    if (!existingLogistics || existingLogistics.length === 0) {
      // Delivery commission rate (configurable; default 10%)
      const { data: settings } = await serviceClient
        .from("platform_settings")
        .select("delivery_commission_pct, settlement_hold_hours")
        .single();
      const commissionPct = Number(
        (settings as unknown as { delivery_commission_pct?: number } | null)
          ?.delivery_commission_pct ?? 0.1
      );
      const holdHours = Number(
        (settings as unknown as { settlement_hold_hours?: number } | null)
          ?.settlement_hold_hours ?? 24
      );

      // Split: Foodo provides rider → Foodo keeps 100%
      //        Restaurant/3rd-party provides rider → Foodo keeps commissionPct
      const foodoCutKobo =
        dispatch_type === "platform_rider"
          ? deliveryFeeKobo
          : Math.round(deliveryFeeKobo * commissionPct);
      const restaurantShareKobo = deliveryFeeKobo - foodoCutKobo;

      const availableAt = new Date(
        Date.now() + holdHours * 60 * 60 * 1000
      ).toISOString();

      const walletRows: Array<Record<string, unknown>> = [];

      if (restaurantShareKobo > 0) {
        walletRows.push({
          restaurant_id: order.restaurant_id,
          order_id,
          type: "order_credit",
          direction: "credit",
          amount_kobo: restaurantShareKobo,
          status: "pending",
          available_at: availableAt,
          description: `Delivery share (${dispatch_type}) — Order #${order.order_number}`,
        });
      }

      if (foodoCutKobo > 0) {
        walletRows.push({
          restaurant_id: order.restaurant_id,
          order_id,
          type: "logistics_fee",
          direction: "debit",
          amount_kobo: foodoCutKobo,
          status: "settled",
          description:
            dispatch_type === "platform_rider"
              ? `Delivery fee (platform rider, 100%) — Order #${order.order_number}`
              : `Delivery commission (${(commissionPct * 100).toFixed(0)}%, ${dispatch_type}) — Order #${order.order_number}`,
        });
      }

      if (walletRows.length > 0) {
        const { error: walletErr } = await serviceClient
          .from("wallet_transactions")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .insert(walletRows as any);
        if (walletErr) {
          return NextResponse.json({ error: walletErr.message }, { status: 500 });
        }
      }

      if (restaurantShareKobo > 0) {
        await serviceClient.rpc("increment_wallet_pending", {
          p_restaurant_id: order.restaurant_id,
          p_amount_kobo: restaurantShareKobo,
        });
      }
    }
  }

  // Update order status + persist the chosen dispatch type on the order itself
  const newStatus = dispatch_type === "platform_rider" ? "assigned_to_rider" : "in_transit";
  const { error: statusErr } = await serviceClient
    .from("orders")
    .update({ status: newStatus, dispatch_type })
    .eq("id", order_id);

  if (statusErr) {
    return NextResponse.json({ error: statusErr.message }, { status: 500 });
  }

  // Telegram notification — awaited so serverless doesn't kill it on response return
  if (dispatch_type === "platform_rider") {
    await sendTelegramRiderAlert(serviceClient, order_id, profile.restaurant_id, order.order_number).catch(console.error);
  }

  return NextResponse.json({ ok: true, status: newStatus, dispatch_type });
}
