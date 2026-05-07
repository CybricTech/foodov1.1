import type { SupabaseClient } from "@supabase/supabase-js";

export async function sendTelegramRiderAlert(
  supabase: SupabaseClient,
  orderId: string,
  restaurantId: string,
  orderNumber: string | number
) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  const [{ data: order }, { data: restaurant }] = await Promise.all([
    supabase
      .from("orders")
      .select("customer_name, customer_phone, delivery_address")
      .eq("id", orderId)
      .single(),
    supabase
      .from("restaurants")
      .select("name")
      .eq("id", restaurantId)
      .single(),
  ]);

  const text =
    `🔔 <b>New Rider Request</b>\n\n` +
    `Pickup restaurant: ${restaurant?.name ?? "—"}\n` +
    `Pickup code: #${orderNumber}\n` +
    `Receivers address: ${order?.delivery_address ?? "—"}\n` +
    `Receivers phone number: ${order?.customer_phone ?? "—"}\n` +
    `Receivers name: ${order?.customer_name ?? "—"}`;

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
}
