import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";

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
    .select("id, restaurant_id, status, fulfillment_type")
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
    // Already assigned — just update the order status
    const newStatus = dispatch_type === "platform_rider" ? "assigned_to_rider" : "in_transit";
    await serviceClient
      .from("orders")
      .update({ status: newStatus })
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

  // Update order status
  const newStatus = dispatch_type === "platform_rider" ? "assigned_to_rider" : "in_transit";
  const { error: statusErr } = await serviceClient
    .from("orders")
    .update({ status: newStatus })
    .eq("id", order_id);

  if (statusErr) {
    return NextResponse.json({ error: statusErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, status: newStatus, dispatch_type });
}
