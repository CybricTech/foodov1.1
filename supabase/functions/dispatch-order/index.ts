import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const TELEGRAM_CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

interface DispatchPayload {
  orderId: string;
  /** Optional override from merchant — takes precedence over restaurant default */
  dispatchMode?: "platform_rider" | "own_rider" | "third_party";
}

async function sendPushNotification(
  expoPushToken: string,
  title: string,
  body: string,
  data: Record<string, unknown> = {}
) {
  await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to: expoPushToken, title, body, data, sound: "default" }),
  }).catch(console.error);
}

function sendTelegramAlert(text: string) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: "HTML" }),
  }).catch((e) => console.error("[telegram]", e));
}

async function dispatchPlatformRider(
  order: {
    id: string;
    order_number: string | number;
    restaurant_id: string;
    customer_name: string | null;
    customer_phone: string | null;
    delivery_address: string | null;
    total_kobo: number | null;
    delivery_fee_kobo: number | null;
    order_items: Array<{ item_name: string; quantity: number }> | null;
  },
  restaurantName: string
) {
  const { id: orderId, order_number: orderNumber, restaurant_id: restaurantId } = order;

  // Find best available platform rider (lowest active deliveries)
  const { data: rider } = await supabase
    .from("platform_riders")
    .select("id, user_id, expo_push_token, active_deliveries")
    .eq("is_online", true)
    .eq("is_active", true)
    .lt("active_deliveries", 3)
    .order("active_deliveries", { ascending: true })
    .limit(1)
    .single();

  if (!rider) {
    // No rider available — alert merchant via SMS
    const { data: restaurant } = await supabase
      .from("restaurants")
      .select("phone")
      .eq("id", restaurantId)
      .single();

    if (restaurant?.phone) {
      await fetch(`${SUPABASE_URL}/functions/v1/send-sms`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          restaurantId,
          phone: restaurant.phone,
          eventType: "new_order_merchant",
          orderId,
          orderNumber,
          message: `No platform riders available for order #${orderNumber}. Please assign manually.`,
        }),
      }).catch(console.error);
    }

    sendTelegramAlert(
      `⚠️ <b>No Rider Available</b>\n\nOrder <b>#${orderNumber}</b> · ${restaurantName}\nCould not find an available platform rider.\nPlease assign manually from the admin portal.`
    );

    return { mode: "platform_rider", assigned: false };
  }

  // Create assignment
  await supabase.from("delivery_assignments").insert({
    order_id: orderId,
    restaurant_id: restaurantId,
    dispatch_type: "platform_rider",
    rider_id: rider.user_id,
    status: "assigned",
  });

  // Increment rider's active deliveries
  await supabase
    .from("platform_riders")
    .update({ active_deliveries: rider.active_deliveries + 1 })
    .eq("id", rider.id);

  // Push notification to rider (Expo app — currently inactive but kept for future)
  if (rider.expo_push_token) {
    await sendPushNotification(
      rider.expo_push_token,
      "New delivery!",
      `Order #${orderNumber} is ready for pickup.`,
      { orderId, type: "new_assignment" }
    );
  }

  // Telegram alert — fire-and-forget
  const items = (order.order_items ?? [])
    .map((i) => `  • ${i.quantity}× ${i.item_name}`)
    .join("\n");
  const totalNaira = order.total_kobo != null ? `₦${(order.total_kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}` : "—";
  const deliveryNaira = order.delivery_fee_kobo != null ? `₦${(order.delivery_fee_kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}` : "—";
  const timeWAT = new Date(Date.now() + 60 * 60 * 1000).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit", hour12: false });

  sendTelegramAlert(
    `🔔 <b>Rider Request</b>\n\n` +
    `📦 Order <b>#${orderNumber}</b> · ${restaurantName}\n` +
    `👤 ${order.customer_name ?? "—"}  |  ${order.customer_phone ?? "—"}\n` +
    `📍 ${order.delivery_address ?? "—"}\n\n` +
    (items ? `🛒\n${items}\n\n` : "") +
    `💰 ${totalNaira} total  ·  ${deliveryNaira} delivery\n` +
    `⏰ ${timeWAT} WAT`
  );

  return { mode: "platform_rider", assigned: true, riderId: rider.user_id };
}

async function dispatchOwnRider(
  orderId: string,
  restaurantId: string
) {
  // Generate a short share link token
  const token = crypto.randomUUID().replace(/-/g, "").substring(0, 16);

  await supabase.from("delivery_assignments").insert({
    order_id: orderId,
    restaurant_id: restaurantId,
    dispatch_type: "own_rider",
    rider_id: null,
    status: "assigned",
    share_link_token: token,
    assigned_at: new Date().toISOString(),
  });

  return { mode: "own_rider", shareToken: token };
}

async function dispatchThirdParty(
  orderId: string,
  restaurantId: string
) {
  // Adapter pattern — try Kwik first
  const KWIK_API_KEY = Deno.env.get("KWIK_API_KEY");

  if (!KWIK_API_KEY) {
    // No third-party configured — fall back to own_rider
    console.warn("No third-party dispatch API configured, falling back to own_rider");
    return dispatchOwnRider(orderId, restaurantId);
  }

  // Fetch order details for the delivery request
  const { data: order } = await supabase
    .from("orders")
    .select("customer_name, customer_phone, delivery_address, total_kobo")
    .eq("id", orderId)
    .single();

  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("name, address, phone")
    .eq("id", restaurantId)
    .single();

  // Kwik delivery API call (adapter)
  let thirdPartyRef: string | null = null;
  try {
    const kwikRes = await fetch("https://api.kwik.delivery/v1/deliveries", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KWIK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        pickup: {
          name: restaurant?.name,
          address: restaurant?.address,
          phone: restaurant?.phone,
        },
        dropoff: {
          name: order?.customer_name,
          address: order?.delivery_address,
          phone: order?.customer_phone,
        },
        cod_amount: order?.total_kobo,
      }),
    });

    if (kwikRes.ok) {
      const kwikData = await kwikRes.json();
      thirdPartyRef = kwikData.id ?? kwikData.reference;
    }
  } catch (e) {
    console.error("Kwik API error:", e);
  }

  await supabase.from("delivery_assignments").insert({
    order_id: orderId,
    restaurant_id: restaurantId,
    dispatch_type: "third_party",
    rider_id: null,
    status: thirdPartyRef ? "assigned" : "failed",
    third_party_ref: thirdPartyRef,
  });

  return { mode: "third_party", ref: thirdPartyRef };
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let payload: DispatchPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { orderId, dispatchMode } = payload;

  if (!orderId) {
    return new Response(
      JSON.stringify({ error: "orderId required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Fetch order + restaurant — include customer/delivery fields for Telegram
  const { data: order } = await supabase
    .from("orders")
    .select(`
      id, order_number, restaurant_id, status,
      customer_name, customer_phone, delivery_address,
      total_kobo, delivery_fee_kobo,
      order_items (item_name, quantity)
    `)
    .eq("id", orderId)
    .single();

  if (!order) {
    return new Response(
      JSON.stringify({ error: "Order not found" }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  if (order.status !== "ready_for_pickup") {
    return new Response(
      JSON.stringify({ error: "Order not ready for dispatch" }),
      { status: 409, headers: { "Content-Type": "application/json" } }
    );
  }

  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("logistics_default, name")
    .eq("id", order.restaurant_id)
    .single();

  const mode = dispatchMode ?? restaurant?.logistics_default ?? "own_rider";

  let result: Record<string, unknown>;

  if (mode === "platform_rider") {
    result = await dispatchPlatformRider(order, restaurant?.name ?? "Unknown");
  } else if (mode === "own_rider") {
    result = await dispatchOwnRider(orderId, order.restaurant_id);
  } else {
    result = await dispatchThirdParty(orderId, order.restaurant_id);
  }

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
