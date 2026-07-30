import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/admin/test-order
 *
 * Admin-only helper to drop a fake "new order" onto a restaurant (default:
 * CopperPot) so we can test the merchant flow — it appears in the live orders
 * queue via realtime AND fires the same `send-push` Edge Function a real paid
 * order triggers, so it's the fastest way to test push notifications without
 * placing + paying for a real order on the storefront.
 *
 * The order is created as confirmed/paid (mirroring the webhook/checkout insert
 * shape) with one real available menu item so FKs + content are valid.
 *
 * Body (all optional):
 *   restaurant   slug/name substring, default "copper"
 *   fulfillment  "pickup" (default) | "delivery"
 *
 * "delivery" exists to test dispatch (migration 101): a pickup order is never
 * dispatched, so it can't exercise the rider path at all. A delivery test order
 * carries a delivery fee and DROP-OFF COORDINATES, without which a Bolt booking
 * aborts to the Telegram fallback and the thing you meant to test never runs.
 */
async function requireSuperAdmin() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const serviceClient = createServiceClient();
  const { data: profile } = await serviceClient
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "super_admin") return null;
  return { serviceClient };
}

export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const supabase = auth.serviceClient;

  // Optional override; defaults to CopperPot. Matched with ILIKE %target%, so
  // keep this a substring shared by both the slug ("the-copper-pot") and the
  // name ("The Copper Pot") — "copperpot" matches neither (the words aren't
  // contiguous in the data).
  let target = "copper";
  let fulfillment: "pickup" | "delivery" = "pickup";
  try {
    const body = (await req.json()) as {
      restaurant?: string;
      fulfillment?: string;
    };
    if (body?.restaurant) target = body.restaurant;
    if (body?.fulfillment === "delivery") fulfillment = "delivery";
  } catch {
    /* no body — use default */
  }

  // 1. Find the restaurant by slug or name.
  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("id, name, latitude, longitude, location_verified_at, dispatch_policy")
    .or(`slug.ilike.%${target}%,name.ilike.%${target}%`)
    .limit(1)
    .maybeSingle();

  if (!restaurant) {
    return NextResponse.json(
      { error: `Restaurant matching "${target}" not found` },
      { status: 404 }
    );
  }

  // 2. Pull one real, available menu item so the order has valid content + FK.
  const { data: menuItem } = await supabase
    .from("menu_items")
    .select("id, name, price_kobo, price")
    .eq("restaurant_id", restaurant.id)
    .eq("is_available", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  // Drop-off: ~1.5km north-east of the store, so the trip is short, real and
  // priced like a bike ride. Derived from the store rather than hardcoded to
  // Lagos, so this still works for a merchant anywhere.
  const storeLat = Number(restaurant.latitude ?? 0);
  const storeLng = Number(restaurant.longitude ?? 0);
  const dropLat = storeLat ? storeLat + 0.012 : null;
  const dropLng = storeLng ? storeLng + 0.012 : null;

  if (fulfillment === "delivery" && (dropLat === null || dropLng === null)) {
    return NextResponse.json(
      {
        error:
          `${restaurant.name} has no coordinates, so a delivery test order would ` +
          `have nowhere to send a rider. Set the store address in Settings › ` +
          `Restaurant location first.`,
      },
      { status: 409 }
    );
  }

  const deliveryFeeKobo = fulfillment === "delivery" ? 150000 : 0; // ₦1,500

  const itemName = menuItem?.name ?? "Test Item";
  const itemPriceKobo =
    (menuItem?.price_kobo as number | null) ||
    (menuItem?.price as number | null) ||
    250000; // ₦2,500 fallback
  const totalKobo = itemPriceKobo + deliveryFeeKobo;
  const orderNumber = `TEST-${Date.now().toString().slice(-6)}`;

  // 3. Insert the order (confirmed/paid — same shape real orders use).
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert({
      restaurant_id: restaurant.id,
      payment_id: null,
      customer_name: "Test Order 🧪",
      customer_phone: "+2348000000000",
      customer_email: null,
      fulfillment_type: fulfillment,
      status: "confirmed",
      payment_status: "paid",
      subtotal_kobo: itemPriceKobo,
      delivery_fee_kobo: deliveryFeeKobo,
      vat_kobo: 0,
      service_fee_kobo: 0,
      total_kobo: totalKobo,
      subtotal: itemPriceKobo,
      total_amount: totalKobo,
      ...(fulfillment === "delivery"
        ? {
            delivery_address: "Test drop-off — admin panel",
            delivery_lat: dropLat,
            delivery_lng: dropLng,
            // Rider-side lifecycle starts here; the timer is armed once the
            // merchant accepts and tells us how long the food will take.
            dispatch_state: "pending",
          }
        : { dispatch_state: "not_required" }),
      special_instructions: "Test order created from the admin panel.",
      order_number: orderNumber,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    .select("id, order_number")
    .single();

  if (orderErr || !order) {
    return NextResponse.json(
      { error: orderErr?.message ?? "Failed to create test order" },
      { status: 500 }
    );
  }

  // 4. Order item (only when we found a real menu item — menu_item_id is a FK).
  if (menuItem) {
    await supabase.from("order_items").insert({
      order_id: order.id,
      restaurant_id: restaurant.id,
      menu_item_id: menuItem.id,
      item_name: itemName,
      item_price: itemPriceKobo,
      item_price_kobo: itemPriceKobo,
      quantity: 1,
      line_total: itemPriceKobo,
      line_total_kobo: itemPriceKobo,
      selected_options: [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  }

  // 5. Fire the push — same Edge Function the real order routes call.
  fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-push`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      restaurantId: restaurant.id,
      orderId: order.id,
      orderNumber: order.order_number,
      totalKobo,
      customerName: "Test Order",
    }),
  }).catch(console.error);

  return NextResponse.json({
    ok: true,
    orderNumber: order.order_number,
    restaurant: restaurant.name,
    fulfillment,
    pushedItem: menuItem ? itemName : null,
    // Surfaced rather than blocking: a store whose address was never confirmed
    // falls back to the Telegram note instead of booking, which is easy to
    // mistake for the timer not firing.
    ...(fulfillment === "delivery" && !restaurant.location_verified_at
      ? {
          warning:
            `${restaurant.name}'s address is not confirmed, so Bolt booking will ` +
            `fall back to the Telegram note. Confirm it in Settings to test the API path.`,
        }
      : {}),
  });
}
