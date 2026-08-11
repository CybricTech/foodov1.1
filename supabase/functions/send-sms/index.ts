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
    | "new_order_merchant"
    | "booking_confirmed"
    | "order_rescheduled"
    | "order_declined";
  orderId: string;
  orderNumber?: string | number;
  /** ISO instant of the booked slot — booking_confirmed / order_rescheduled. */
  scheduledFor?: string;
  /** Merchant's reason — order_declined. */
  reason?: string;
  /**
   * Bolt-hosted live tracking page for the ride — order_in_transit only.
   * Appended to the message when present; omitted entirely when it isn't, so a
   * ride booked by hand (no Bolt ride_id, therefore no tracking page) still
   * sends a clean message rather than a dangling "Track it:".
   */
  trackingUrl?: string;
}

/** "Thu 3 Jul, 6:30 PM" in Africa/Lagos — how slot times read in SMS copy. */
function formatSlotForSms(iso: string | undefined): string {
  if (!iso) return "your booked time";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "your booked time";
  const day = d.toLocaleDateString("en-NG", {
    timeZone: "Africa/Lagos",
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const time = d.toLocaleTimeString("en-NG", {
    timeZone: "Africa/Lagos",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${day}, ${time}`;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Caller auth — see _shared auth note in settle-payouts/index.ts. Every
// legitimate caller (Next.js API routes, other edge functions) already sends
// this exact value as its bearer, so this is a same-value comparison, not a
// new credential.
const CRON_ENGINE_KEY = Deno.env.get("CRON_ENGINE_KEY") ?? SUPABASE_SERVICE_KEY;
const SENDCHAMP_API_KEY = Deno.env.get("SENDCHAMP_API_KEY")!;
const SENDCHAMP_DEFAULT_SENDER_ID = Deno.env.get("SENDCHAMP_DEFAULT_SENDER_ID") ?? "Kitchyn";
const SENDCHAMP_ROUTE = Deno.env.get("SENDCHAMP_ROUTE") ?? "non_dnd";
const TERMII_API_KEY = Deno.env.get("TERMII_API_KEY")!;
const TERMII_SENDER_ID = Deno.env.get("TERMII_SENDER_ID") ?? "Foodo";

// ── Infobip (Meta WhatsApp Business API BSP) ─────────────────────────────────
// Infobip sends APPROVED TEMPLATES ONLY — free-form text is not accepted for
// business-initiated messages. Merchant order alerts are business-initiated
// (the merchant never messaged us first), so the 24-hour customer-service
// window never applies and a template is mandatory on every send. Switching
// BSP does not change this: it is a Meta platform rule, not a vendor one.
//
// INFOBIP_BASE_URL is ACCOUNT-SPECIFIC (e.g. xxxxx.api.infobip.com) — there is
// no shared host to hardcode, so it must be configured per environment.
// INFOBIP_SENDER is the registered WhatsApp sender number the alert comes from.
//
// Until INFOBIP_API_KEY, INFOBIP_BASE_URL and INFOBIP_SENDER are all set the
// WhatsApp path is skipped and merchants fall through to SMS, so deploying
// ahead of sender registration and template approval is safe.
const INFOBIP_API_KEY = Deno.env.get("INFOBIP_API_KEY");
const INFOBIP_BASE_URL = Deno.env.get("INFOBIP_BASE_URL");
const INFOBIP_SENDER = Deno.env.get("INFOBIP_SENDER");
const INFOBIP_TEMPLATE_NAME =
  Deno.env.get("INFOBIP_TEMPLATE_NAME") ?? "new_order_merchant";
const INFOBIP_TEMPLATE_LANG = Deno.env.get("INFOBIP_TEMPLATE_LANG") ?? "en";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ── Caller authorization ───────────────────────────────────────────────────
// verify_jwt (Supabase's own gateway check) only proves the caller presented
// SOME validly-signed project JWT — the public anon/publishable key qualifies,
// and so does a legacy JWT even after "disable legacy API keys" (that toggle
// only affects PostgREST, not the Edge Functions gateway). This function
// therefore checks the bearer itself, matching the shared internal secret.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function isAuthorized(req: Request): boolean {
  if (!CRON_ENGINE_KEY) return false;
  return timingSafeEqual(req.headers.get("authorization") ?? "", `Bearer ${CRON_ENGINE_KEY}`);
}

// ── Simple SMS message builder (customer notifications + SMS fallback) ────────
function buildMessage(
  eventType: SmsPayload["eventType"],
  orderNumber: string | number | undefined,
  restaurantName: string,
  extras?: { scheduledFor?: string; reason?: string; trackingUrl?: string }
): string {
  const num = orderNumber ? `#${orderNumber}` : "";
  switch (eventType) {
    case "booking_confirmed":
      return `Your order ${num} at ${restaurantName} is booked for ${formatSlotForSms(extras?.scheduledFor)}. We'll start preparing it then — you can cancel from your order page until shortly before.`;
    case "order_rescheduled":
      return `${restaurantName} moved your order ${num} to ${formatSlotForSms(extras?.scheduledFor)}.${extras?.reason ? ` Reason: ${extras.reason}` : ""} Check your order page for details.`;
    case "order_declined":
      return `${restaurantName} couldn't take your scheduled order ${num}.${extras?.reason ? ` Reason: ${extras.reason}` : ""} A refund will be processed within 3-5 business days.`;
    case "order_confirmed":
      return `Thanks for ordering from ${restaurantName}! Your order ${num} is confirmed — we'll text you again when it's ready.`;
    case "order_preparing":
      return `Great news! ${restaurantName} is preparing your order ${num}. 🍽️`;
    case "order_ready":
      return `Your order ${num} is ready for pickup at ${restaurantName}! 🛍️`;
    case "order_in_transit":
      return extras?.trackingUrl
        ? `Your order ${num} from ${restaurantName} is on its way! Track your rider: ${extras.trackingUrl}`
        : `Your order ${num} from ${restaurantName} is ready and on its way! Sit tight!`;
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
  scheduled_for?: string | null;
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

  if (order.scheduled_for) {
    lines.push(`⏰ *Scheduled Order #${order.order_number}*`);
    lines.push(`📅 *Booked for:* ${formatSlotForSms(order.scheduled_for)}`);
  } else {
    lines.push(`🍽️ *New Order #${order.order_number}*`);
  }
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

// ── Send via Infobip (WhatsApp template) ──────────────────────────────────────
/**
 * Sends the approved merchant new-order template.
 *
 * Placeholders are POSITIONAL and must match the approved template exactly — a
 * count mismatch fails the send. Order:
 *   {{1}} order number   {{2}} customer name   {{3}} item count
 *   {{4}} order total    {{5}} fulfillment type
 *
 * No `buttons` are sent: the template's "View Order" button is a STATIC URL to
 * the orders board, and a static button takes no runtime parameter. Revisit if
 * the board ever learns to open a specific order from a query param — today it
 * ignores them, so a per-order dynamic URL would look like a deep link while
 * landing on the plain board.
 *
 * Values are deliberately short single-line strings: WhatsApp rejects template
 * parameters containing newlines, tabs or long runs of spaces, which is why the
 * rich multi-line message used for SMS cannot be ported here as-is.
 *
 * `to` takes the already-normalized international number (no '+'), so unlike
 * the previous BSP integration there is no country restriction here.
 */
async function sendViaInfobip(
  phone: string,
  params: {
    orderNumber: string;
    customerName: string;
    itemCount: number;
    totalKobo: number;
    fulfillmentType: string;
    orderId: string;
  }
): Promise<{ ok: boolean; messageId: string | null }> {
  if (!INFOBIP_API_KEY || !INFOBIP_BASE_URL || !INFOBIP_SENDER) {
    return { ok: false, messageId: null };
  }

  const base = INFOBIP_BASE_URL.replace(/\/+$/, "");
  const url = `${base.startsWith("http") ? base : `https://${base}`}/whatsapp/1/message/template`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      // Infobip's own scheme — NOT Bearer and NOT Basic.
      Authorization: `App ${INFOBIP_API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      messages: [
        {
          from: INFOBIP_SENDER,
          to: normalizePhoneE164(phone),
          // Our own id, echoed on the delivery-status webhook so a result can
          // be matched back to its order without a second lookup.
          messageId: params.orderId,
          content: {
            templateName: INFOBIP_TEMPLATE_NAME,
            language: INFOBIP_TEMPLATE_LANG,
            templateData: {
              body: {
                placeholders: [
                  params.orderNumber,
                  params.customerName,
                  String(params.itemCount),
                  formatKoboToNaira(params.totalKobo),
                  params.fulfillmentType === "pickup" ? "Pickup" : "Delivery",
                ],
              },
            },
          },
        },
      ],
    }),
  });

  if (res.status === 429) {
    console.error("Infobip rate limit exceeded");
    return { ok: false, messageId: null };
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`Infobip send failed: ${res.status} ${JSON.stringify(body)}`);
    return { ok: false, messageId: null };
  }

  // Infobip always returns 200 with a per-message status; a REJECTED group
  // means the send did NOT happen even though the HTTP call succeeded, so the
  // status has to be inspected rather than trusting res.ok alone.
  const msg = body.messages?.[0];
  const group = msg?.status?.groupName;
  if (group === "REJECTED" || group === "UNDELIVERABLE") {
    console.error(`Infobip rejected message: ${JSON.stringify(msg?.status)}`);
    return { ok: false, messageId: null };
  }
  // PENDING/ACCEPTED only means accepted for delivery — the real
  // DELIVERED/EXPIRED/REJECTED outcome arrives later on the status webhook.
  return { ok: true, messageId: msg?.messageId ?? null };
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
  channel: "sms" | "whatsapp",
  /** Provider-side message id — Infobip's, for its delivery-status webhook. */
  providerRef?: string | null
) {
  await supabase
    .from("sms_logs")
    .update({
      status,
      provider,
      channel,
      ...(providerRef ? { provider_ref: providerRef } : {}),
      sent_at: status === "sent" ? new Date().toISOString() : null,
    })
    .eq("id", logId);
}

// ── Main handler ──────────────────────────────────────────────────────────────
serve(async (req) => {
  if (!isAuthorized(req)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
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
        scheduled_for,
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
      // WhatsApp via Infobip — an approved template, not free-form text.
      // message_body still records the human-readable summary so the SMS Logs
      // screen stays readable; the wire payload is the template's variables.
      const itemCount = order.order_items.reduce(
        (sum, item) => sum + item.quantity,
        0
      );
      messageToSend = buildWhatsAppOrderMessage(order);
      provider = "infobip";
      const logId = await createLog({
        restaurantId,
        orderId,
        phone: whatsappNumber,
        message: messageToSend,
        eventType,
        provider: "infobip",
        channel: "whatsapp",
        status: "queued",
      });

      const result = await sendViaInfobip(whatsappNumber, {
        orderNumber,
        customerName: order.customer_name ?? "Guest",
        itemCount,
        totalKobo: order.total_kobo,
        fulfillmentType: order.fulfillment_type,
        orderId,
      });
      sent = result.ok;
      channel = "whatsapp";

      if (!sent) {
        // Template rejected, config missing, or Infobip unreachable — the
        // merchant still has to learn an order arrived, so drop to SMS on the
        // same number. Provider flips so the log reflects what actually sent.
        const simpleMessage = buildMessage(eventType, orderNumber, restaurantName);
        sent = await sendViaTermii(whatsappNumber, simpleMessage);
        provider = "termii";
        channel = "sms";
        messageToSend = simpleMessage;
      }

      if (logId) {
        await updateLog(
          logId,
          sent ? "sent" : "failed",
          provider,
          channel,
          result.messageId
        );
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

      // Termii is the only SMS path now — the Twilio fallback was retired with
      // the Infobip migration. A Termii failure here is terminal for this
      // send; pg_cron retries cover transient outages.
      sent = await sendViaTermii(recipientPhone, messageToSend);

      if (logId) {
        await updateLog(logId, sent ? "sent" : "failed", provider, "sms");
      }
    }

    // ── Admin copy (fire-and-forget) ──────────────────────────────────────
    // STILL ON TERMII WHATSAPP, deliberately. Moving this to Infobip needs a
    // SECOND approved template (the admin variant is prefixed with the
    // restaurant name, so it has a different variable set) and only one
    // template — the merchant new-order alert — has been submitted. Termii's
    // WhatsApp channel keeps working, so this path is left untouched rather
    // than pointed at a template that does not exist. Revisit once an admin
    // template is approved.
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
  const message = buildMessage(eventType, orderNumber, restaurantName, {
    scheduledFor: payload.scheduledFor,
    reason: payload.reason,
    trackingUrl: payload.trackingUrl,
  });

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
