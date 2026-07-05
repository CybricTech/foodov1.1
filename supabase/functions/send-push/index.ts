import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * send-push — Expo push fan-out for new merchant orders.
 *
 * Called fire-and-forget by the three order-confirmation routes (paystack /
 * monnify webhooks + checkout/status polling) right next to the existing
 * send-sms "new_order_merchant" dispatch. Looks up every Expo push token
 * registered for the restaurant and POSTs a single batched request to Expo's
 * push service (https://exp.host) — Expo handles FCM/APNs delivery, so we never
 * touch raw FCM server keys.
 *
 * Mirrors send-sms: Deno `serve`, service-role Supabase client from
 * SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, simple JSON in/out.
 */

interface PushPayload {
  restaurantId: string;
  orderId: string;
  orderNumber?: string | number;
  totalKobo?: number;
  customerName?: string;
  /**
   * What this push announces (default "new_order", fully backward compatible):
   *   new_order                 — a live order just landed in the queue
   *   scheduled_booking         — a pre-order was booked for a future slot
   *   scheduled_slot_approaching — a booked slot is alert_lead_minutes away
   */
  kind?: "new_order" | "scheduled_booking" | "scheduled_slot_approaching";
  /** ISO instant of the booked slot — the two scheduled kinds. */
  scheduledFor?: string;
}

/** "Thu 3 Jul, 6:30 PM" in Africa/Lagos. */
function formatSlot(iso: string | undefined): string {
  if (!iso) return "the booked time";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "the booked time";
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

interface ExpoMessage {
  to: string;
  sound: "default";
  title: string;
  body: string;
  data: { orderId: string };
  priority: "high";
  channelId: "orders";
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/** kobo → "₦12,500" (thousands grouped, no decimals). */
function formatKoboToNaira(kobo: number): string {
  const naira = Math.round(kobo / 100);
  return `₦${naira.toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  let payload: PushPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400, headers: corsHeaders });
  }

  const { restaurantId, orderId, orderNumber, totalKobo, customerName, scheduledFor } = payload;
  const kind = payload.kind ?? "new_order";
  if (!restaurantId || !orderId) {
    return new Response(
      JSON.stringify({ error: "restaurantId and orderId are required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Service-role read: every device token registered for this restaurant.
  const { data: rows, error } = await supabase
    .from("device_tokens")
    .select("expo_push_token")
    .eq("restaurant_id", restaurantId);

  if (error) {
    console.error("send-push: token lookup failed:", error);
    return new Response(
      JSON.stringify({ error: "token lookup failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const tokens = (rows ?? [])
    .map((r) => (r as { expo_push_token: string }).expo_push_token)
    .filter((t): t is string => Boolean(t));

  if (tokens.length === 0) {
    return new Response(
      JSON.stringify({ success: true, sent: 0, note: "no registered devices" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const numLabel = orderNumber ? ` #${orderNumber}` : "";
  let title: string;
  const bodyParts: string[] = [];
  if (kind === "scheduled_slot_approaching") {
    title = `⏰ Scheduled order${numLabel} coming up`;
    bodyParts.push(`Due ${formatSlot(scheduledFor)}`);
  } else if (kind === "scheduled_booking") {
    title = `📅 Pre-order${numLabel} booked`;
    bodyParts.push(`For ${formatSlot(scheduledFor)}`);
  } else {
    title = `New order${numLabel}`;
  }
  if (customerName) bodyParts.push(customerName);
  if (typeof totalKobo === "number") bodyParts.push(formatKoboToNaira(totalKobo));
  const body = bodyParts.join(" · ") || "Tap to view the order.";

  const messages: ExpoMessage[] = tokens.map((token) => ({
    to: token,
    sound: "default",
    title,
    body,
    data: { orderId },
    priority: "high",
    channelId: "orders",
  }));

  let expoResult: unknown = null;
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });
    expoResult = await res.json().catch(() => null);

    if (!res.ok) {
      console.error(`send-push: Expo responded ${res.status}`, expoResult);
      return new Response(
        JSON.stringify({ error: "expo push failed", status: res.status, expoResult }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (e) {
    console.error("send-push: Expo request error:", e);
    return new Response(
      JSON.stringify({ error: "expo request error" }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Best-effort cleanup: Expo returns a per-message ticket array. Tickets with
  // status "error" + details.error "DeviceNotRegistered" mean the token is dead;
  // delete those rows so we stop pushing to them. Index-aligned with `tokens`.
  try {
    const tickets = (expoResult as { data?: Array<{ status?: string; details?: { error?: string } }> } | null)?.data;
    if (Array.isArray(tickets)) {
      const dead: string[] = [];
      tickets.forEach((ticket, i) => {
        if (
          ticket?.status === "error" &&
          ticket?.details?.error === "DeviceNotRegistered" &&
          tokens[i]
        ) {
          dead.push(tokens[i]);
        }
      });
      if (dead.length > 0) {
        await supabase.from("device_tokens").delete().in("expo_push_token", dead);
      }
    }
  } catch (e) {
    // Cleanup is non-fatal — the push already went out.
    console.error("send-push: token cleanup error:", e);
  }

  return new Response(
    JSON.stringify({ success: true, sent: tokens.length }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
