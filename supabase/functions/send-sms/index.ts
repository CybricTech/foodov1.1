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
const TERMII_API_KEY = Deno.env.get("TERMII_API_KEY")!;
const TERMII_SENDER_ID = Deno.env.get("TERMII_SENDER_ID") ?? "Foodo";
const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
const TWILIO_PHONE_NUMBER = Deno.env.get("TWILIO_PHONE_NUMBER");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function buildMessage(
  eventType: SmsPayload["eventType"],
  orderNumber: string | number | undefined,
  restaurantName: string
): string {
  const num = orderNumber ? `#${orderNumber}` : "";
  switch (eventType) {
    case "order_confirmed":
      return `Your order ${num} from ${restaurantName} has been confirmed! We'll notify you when it's ready.`;
    case "order_preparing":
      return `Great news! ${restaurantName} is preparing your order ${num}. 🍽️`;
    case "order_ready":
      return `Your order ${num} from ${restaurantName} is ready for pickup!`;
    case "order_in_transit":
      return `Your order ${num} from ${restaurantName} is on its way! 🛵`;
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

async function sendViaTermii(
  phone: string,
  message: string
): Promise<boolean> {
  const res = await fetch("https://api.ng.termii.com/api/sms/send", {
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

  // Resolve restaurant name (for message copy)
  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("name, phone")
    .eq("id", restaurantId)
    .single();

  const restaurantName = restaurant?.name ?? "the restaurant";

  // Resolve recipient phone
  let recipientPhone = payload.phone;
  if (!recipientPhone && eventType === "new_order_merchant") {
    recipientPhone = restaurant?.phone ?? undefined;
  }

  if (!recipientPhone) {
    return new Response(
      JSON.stringify({ error: "No recipient phone" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const message = buildMessage(eventType, orderNumber, restaurantName);

  // Create SMS log (status=queued)
  const { data: log, error: logError } = await supabase
    .from("sms_logs")
    .insert({
      restaurant_id: restaurantId,
      order_id: orderId,
      phone: recipientPhone,
      message,
      event_type: eventType,
      provider: "termii",
      status: "queued",
    })
    .select("id")
    .single();

  if (logError) {
    console.error("Failed to create SMS log:", logError);
  }

  // Try Termii first
  let sent = await sendViaTermii(recipientPhone, message);
  let provider = "termii";

  // Fallback to Twilio
  if (!sent) {
    sent = await sendViaTwilio(recipientPhone, message);
    provider = "twilio";
  }

  // Update log
  if (log) {
    await supabase
      .from("sms_logs")
      .update({
        status: sent ? "sent" : "failed",
        provider: provider as "termii" | "twilio",
        sent_at: sent ? new Date().toISOString() : null,
      })
      .eq("id", log.id);
  }

  return new Response(
    JSON.stringify({ success: sent, provider }),
    {
      status: sent ? 200 : 502,
      headers: { "Content-Type": "application/json" },
    }
  );
});
