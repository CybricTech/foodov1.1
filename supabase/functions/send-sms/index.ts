import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface SmsPayload {
  restaurantId: string;
  /** Recipient phone — E.164. If not provided, looks up merchant phone for merchant events. */
  phone?: string;
  eventType:
    | "order_confirmed"
    | "order_preparing"
    | "order_ready"
    | "order_in_transit"
    | "order_delivered"
    | "order_cancelled"
    | "new_order_merchant";
  orderId: string;
  orderNumber?: string | number;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SENDCHAMP_API_KEY = Deno.env.get("SENDCHAMP_API_KEY")!;
const SENDCHAMP_DEFAULT_SENDER_ID = Deno.env.get("SENDCHAMP_DEFAULT_SENDER_ID") ?? "Foodo";
const SENDCHAMP_ROUTE = Deno.env.get("SENDCHAMP_ROUTE") ?? "non_dnd";
const TERMII_API_KEY = Deno.env.get("TERMII_API_KEY")!;
const TERMII_SENDER_ID = Deno.env.get("TERMII_SENDER_ID") ?? "Foodo";
const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
const TWILIO_PHONE_NUMBER = Deno.env.get("TWILIO_PHONE_NUMBER");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ── Simple SMS message builder (customer notifications + SMS fallback) ────────
function buildMessage(
  eventType: SmsPayload["eventType"],
  orderNumber: string | number | undefined,
  restaurantName: string
): string {
  const num = orderNumber ? `#${orderNumber}` : "";
  switch (eventType) {
    case "order_confirmed":
      return `Thanks for ordering from ${restaurantName}! Your order ${num} is confirmed — we'll text you again when it's ready.`;
    case "order_preparing":
      return `Great news! ${restaurantName} is preparing your order ${num}. 🍽️`;
    case "order_ready":
      return `Your order ${num} is ready for pickup at ${restaurantName}! 🛍️`;
    case "order_in_transit":
      return `Your order ${num} from ${restaurantName} is ready and on its way! Sit tight!`;
    case "order_delivered":
      return `Your order ${num} from ${restaurantName} has been delivered. Enjoy your meal! 😋`;
    case "order_cancelled":
      return `Your order ${num} from ${restaurantName} has been cancelled. A refund will be processed within 3-5 business days.`;
    case "new_order_merchant":
      return `New order ${num} received! Log in to your dashboard to confirm.`;
    default:
      return `Update on your order ${num} from ${restaurantName}.`;
  }
}

// ── Format kobo to human-readable Naira ───────────────────────────────────────
function formatKoboToNaira(kobo: number): string {
  const naira = kobo / 100;
  return `₦${naira.toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

// ── Rich WhatsApp message for merchant new order alerts ───────────────────────
interface OrderForMessage {
  order_number: string;
  customer_name: string | null;
  customer_phone: string | null;
  fulfillment_type: string;
  delivery_address: string | null;
  special_instructions: string | null;
  subtotal_kobo: number;
  delivery_fee_kobo: number;
  total_kobo: number;
  order_items: Array<{
    item_name: string;
    quantity: number;
    line_total_kobo: number;
    selected_options: unknown;
  }>;
}

function buildWhatsAppOrderMessage(order: OrderForMessage): string {
  const lines: string[] = [];

  lines.push(`🍽️ *New Order #${order.order_number}*`);
  lines.push("");
  lines.push(`👤 *Customer:* ${order.customer_name ?? "—"}`);
  lines.push(`📞 *Phone:* ${order.customer_phone ?? "—"}`);
  lines.push("");
  lines.push("📦 *Items:*");

  for (const item of order.order_items) {
    lines.push(
      `• ${item.item_name} x${item.quantity} — ${formatKoboToNaira(item.line_total_kobo)}`
    );

    // Show selected options if present
    if (item.selected_options && Array.isArray(item.selected_options)) {
      for (const opt of item.selected_options as Array<{
        optionName?: string;
        choices?: Array<{ choiceName?: string }>;
      }>) {
        if (opt.choices && Array.isArray(opt.choices)) {
          for (const choice of opt.choices) {
            if (choice.choiceName) {
              lines.push(`  ↳ ${opt.optionName ?? "Option"}: ${choice.choiceName}`);
            }
          }
        }
      }
    }
  }

  lines.push("");

  if (order.fulfillment_type === "pickup") {
    lines.push("🏠 *Fulfillment:* Pickup (customer will collect)");
  } else {
    lines.push("🏠 *Fulfillment:* Delivery");
    if (order.delivery_address) {
      lines.push(`📍 *Address:* ${order.delivery_address}`);
    }
  }

  if (order.special_instructions) {
    lines.push("");
    lines.push(`📝 *Special Instructions:* ${order.special_instructions}`);
  }

  lines.push("");
  lines.push(`💰 *Subtotal:* ${formatKoboToNaira(order.subtotal_kobo)}`);
  if (order.delivery_fee_kobo > 0) {
    lines.push(`🚚 *Delivery Fee:* ${formatKoboToNaira(order.delivery_fee_kobo)}`);
  }
  lines.push(`💳 *Total Paid:* ${formatKoboToNaira(order.total_kobo)}`);

  return lines.join("\n");
}

// Admin version — prepended with restaurant name
function buildAdminWhatsAppOrderMessage(
  order: OrderForMessage,
  restaurantName: string
): string {
  return `🏪 *[${restaurantName}]*\n\n${buildWhatsAppOrderMessage(order)}`;
}

// ── Normalize Nigerian phone numbers to E.164 (no '+'), Sendchamp format ──────
// Accepts: "08012345678", "+2348012345678", "2348012345678", "8012345678"
// Returns: "2348012345678" (Nigerian) or digit-only original for other countries.
function normalizePhoneE164(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("234")) return digits;
  if (digits.length === 11 && digits.startsWith("0")) return "234" + digits.slice(1);
  if (digits.length === 10) return "234" + digits;
  return digits;
}

// ── Send via Sendchamp (SMS — customer order notifications) ───────────────────
async function sendViaSendchamp(
  phone: string,
  message: string,
  senderName: string
): Promise<boolean> {
  const res = await fetch("https://api.sendchamp.com/api/v1/sms/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SENDCHAMP_API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      to: [phone],
      message,
      sender_name: senderName,
      route: SENDCHAMP_ROUTE,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`Sendchamp send failed: ${res.status} ${body}`);
    return { ok: false, messageId: null };
  }

  const body = await res.json().catch(() => ({}));
  const messageId: string | null = body.data?.id ?? null;
  return { ok: body.status === "success", messageId };
}

// ── Send via Termii (SMS — generic channel) ───────────────────────────────────
async function sendViaTermii(
  phone: string,
  message: string
): Promise<boolean> {
  const res = await fetch("https://v3.api.termii.com/api/sms/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to: phone,
      from: TERMII_SENDER_ID,
      sms: message,
      type: "plain",
      api_key: TERMII_API_KEY,
      channel: "generic",
    }),
  });

  if (res.status === 429) {
    // Rate limited — exponential backoff handled by pg_cron retry
    return false;
  }

  const body = await res.json().catch(() => ({}));
  return res.ok && body.code !== "err";
}

// ── Send via Termii (WhatsApp channel) ────────────────────────────────────────
async function sendViaTermiiWhatsApp(
  phone: string,
  message: string
): Promise<boolean> {
  const res = await fetch("https://v3.api.termii.com/api/sms/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to: phone,
      from: TERMII_SENDER_ID,
      sms: message,
      type: "plain",
      api_key: TERMII_API_KEY,
      channel: "whatsapp",
    }),
  });

  if (res.status === 429) return false;
  const body = await res.json().catch(() => ({}));
  return res.ok && body.code !== "err";
}

// ── Send via Twilio (SMS fallback) ────────────────────────────────────────────
async function sendViaTwilio(
  phone: string,
  message: string
): Promise<boolean> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
    return false;
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
  const credentials = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);

  const body = new URLSearchParams({
    From: TWILIO_PHONE_NUMBER,
    To: phone,
    Body: message,
  });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  return res.ok;
}

// ── Helper: log to sms_logs ───────────────────────────────────────────────────
async function createLog(params: {
  restaurantId: string;
  orderId: string;
  phone: string | null | undefined;
  message: string | null | undefined;
  eventType: string;
  provider: string;
  channel: "sms" | "whatsapp";
  status: "queued" | "sent" | "failed";
}): Promise<string | null> {
  if (!params.phone) {
    console.warn("Skipping sms_logs insert: recipient_phone is null");
    return null;
  }
  if (!params.message) {
    console.warn("Skipping sms_logs insert: message_body is null");
    return null;
  }

  const { data: log, error } = await supabase
    .from("sms_logs")
    .insert({
      restaurant_id: params.restaurantId,
      order_id: params.orderId,
      recipient_phone: params.phone,
      message_body: params.message,
      event_type: params.eventType,
      provider: params.provider,
      status: params.status,
      channel: params.channel,
    })
    .select("id")
    .single();

  if (error) console.error("Failed to create SMS log:", error);
  return log?.id ?? null;
}

async function updateLog(
  logId: string,
  status: "sent" | "failed",
  provider: string,
  channel: "sms" | "whatsapp"
) {
  await supabase
    .from("sms_logs")
    .update({
      status,
      provider,
      channel,
      sent_at: status === "sent" ? new Date().toISOString() : null,
    })
    .eq("id", logId);
}

// ── Main handler ──────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let payload: SmsPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { restaurantId, eventType, orderId, orderNumber } = payload;

  // Resolve restaurant info (including whatsapp_number + sender ID for Sendchamp)
  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("name, phone, whatsapp_number, sms_sender_id, sms_sender_status")
    .eq("id", restaurantId)
    .single();

  const restaurantName = restaurant?.name ?? "the restaurant";

  // Per-restaurant sender ID — only used when Sendchamp has approved it.
  // Otherwise fall back to the platform default (e.g. "Foodo").
  const sendchampSender =
    restaurant?.sms_sender_status === "approved" && restaurant?.sms_sender_id
      ? restaurant.sms_sender_id
      : SENDCHAMP_DEFAULT_SENDER_ID;

  // ── Merchant new order alerts: WhatsApp with SMS fallback ───────────────
  if (eventType === "new_order_merchant") {
    // Fetch full order + items for rich message
    const { data: order } = await supabase
      .from("orders")
      .select(
        `
        id,
        order_number,
        customer_name,
        customer_phone,
        fulfillment_type,
        delivery_address,
        special_instructions,
        subtotal_kobo,
        delivery_fee_kobo,
        total_kobo,
        order_items (
          item_name,
          quantity,
          line_total_kobo,
          selected_options
        )
      `
      )
      .eq("id", orderId)
      .single();

    const whatsappNumber = restaurant?.whatsapp_number;
    let sent = false;
    let provider = "termii";
    let channel: "sms" | "whatsapp" = "sms";
    const recipientPhone = whatsappNumber ?? restaurant?.phone;

    if (!recipientPhone) {
      return new Response(
        JSON.stringify({ error: "No recipient phone" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Determine which message to build
    let messageToSend: string;

    if (whatsappNumber && order) {
      // Try WhatsApp with rich message
      messageToSend = buildWhatsAppOrderMessage(order);
      const logId = await createLog({
        restaurantId,
        orderId,
        phone: whatsappNumber,
        message: messageToSend,
        eventType,
        provider: "termii",
        channel: "whatsapp",
        status: "queued",
      });

      sent = await sendViaTermiiWhatsApp(whatsappNumber, messageToSend);
      channel = "whatsapp";

      if (!sent) {
        // WhatsApp failed — fall back to SMS on same number
        const simpleMessage = buildMessage(eventType, orderNumber, restaurantName);
        sent = await sendViaTermii(whatsappNumber, simpleMessage);
        channel = "sms";
        messageToSend = simpleMessage;
      }

      if (logId) {
        await updateLog(logId, sent ? "sent" : "failed", provider, channel);
      }
    } else {
      // No WhatsApp number — send SMS on restaurant phone
      messageToSend = buildMessage(eventType, orderNumber, restaurantName);
      const logId = await createLog({
        restaurantId,
        orderId,
        phone: recipientPhone,
        message: messageToSend,
        eventType,
        provider: "termii",
        channel: "sms",
        status: "queued",
      });

      sent = await sendViaTermii(recipientPhone, messageToSend);

      if (!sent) {
        sent = await sendViaTwilio(recipientPhone, messageToSend);
        provider = "twilio";
      }

      if (logId) {
        await updateLog(logId, sent ? "sent" : "failed", provider, "sms");
      }
    }

    // ── Admin copy (fire-and-forget) ──────────────────────────────────────
    if (order) {
      const { data: platformSettings } = await supabase
        .from("platform_settings")
        .select("admin_whatsapp_number")
        .single();

      const adminWhatsappNumber = platformSettings?.admin_whatsapp_number;

      if (adminWhatsappNumber) {
        const adminMessage = buildAdminWhatsAppOrderMessage(order, restaurantName);

        // Fire-and-forget: send + log
        sendViaTermiiWhatsApp(adminWhatsappNumber, adminMessage)
          .then(async (adminSent) => {
            await createLog({
              restaurantId,
              orderId,
              phone: adminWhatsappNumber,
              message: adminMessage,
              eventType,
              provider: "termii",
              channel: "whatsapp",
              status: adminSent ? "sent" : "failed",
            });
          })
          .catch(console.error);
      }
    }

    return new Response(
      JSON.stringify({ success: sent, provider, channel }),
      {
        status: sent ? 200 : 502,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // ── Customer order notifications — Sendchamp only ───────────────────────
  let recipientPhone = payload.phone;
  if (!recipientPhone) {
    recipientPhone = restaurant?.phone ?? undefined;
  }

  if (!recipientPhone) {
    return new Response(
      JSON.stringify({ error: "No recipient phone" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Sendchamp requires E.164-style digits-only ("23480...").
  const normalizedPhone = normalizePhoneE164(recipientPhone);
  const message = buildMessage(eventType, orderNumber, restaurantName);

  const logId = await createLog({
    restaurantId,
    orderId,
    phone: normalizedPhone,
    message,
    eventType,
    provider: "sendchamp",
    channel: "sms",
    status: "queued",
  });

  const { ok: sent, messageId } = await sendViaSendchamp(normalizedPhone, message, sendchampSender);

  if (logId) {
    await updateLog(logId, sent ? "sent" : "failed", "sendchamp", "sms");
    // Store Sendchamp's message ID for future delivery status lookups
    if (messageId) {
      await supabase.from("sms_logs").update({ provider_ref: messageId }).eq("id", logId);
    }
  }

  return new Response(
    JSON.stringify({ success: sent, provider: "sendchamp", sender: sendchampSender, messageId }),
    {
      status: sent ? 200 : 502,
      headers: { "Content-Type": "application/json" },
    }
  );
});
