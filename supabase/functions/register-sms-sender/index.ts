import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface Payload {
  restaurantId: string;
  /** Override the auto-sanitized name. Optional — defaults to sanitized restaurant.name. */
  senderName?: string;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Caller auth — see settle-payouts/index.ts. Every legitimate caller already
// sends this exact value as its bearer.
const CRON_ENGINE_KEY = Deno.env.get("CRON_ENGINE_KEY") ?? SUPABASE_SERVICE_KEY;
const SENDCHAMP_API_KEY = Deno.env.get("SENDCHAMP_API_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// verify_jwt only proves SOME validly-signed project JWT was presented — check
// the bearer against the shared internal secret ourselves (see send-sms).
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

// Sendchamp / NCC sender-ID rules: alphanumeric only, max 11 chars.
function sanitizeSenderName(name: string): string | null {
  const clean = name.replace(/[^a-zA-Z0-9]/g, "").slice(0, 11);
  return clean.length >= 3 ? clean : null;
}

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

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { restaurantId } = payload;
  if (!restaurantId) {
    return new Response(
      JSON.stringify({ error: "restaurantId required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const { data: restaurant, error: restErr } = await supabase
    .from("restaurants")
    .select("id, name, sms_sender_id, sms_sender_status")
    .eq("id", restaurantId)
    .single();

  if (restErr || !restaurant) {
    return new Response(
      JSON.stringify({ error: "Restaurant not found" }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  // Idempotent — skip if we already have a registration on file for this restaurant.
  if (restaurant.sms_sender_id) {
    return new Response(
      JSON.stringify({
        ok: true,
        skipped: true,
        reason: "already_registered",
        sender_id: restaurant.sms_sender_id,
        status: restaurant.sms_sender_status,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  const candidateName = payload.senderName ?? restaurant.name;
  const senderName = sanitizeSenderName(candidateName);

  if (!senderName) {
    return new Response(
      JSON.stringify({
        error: "Sender name too short after sanitization (alphanumeric, min 3 chars)",
        original: candidateName,
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Sample message used for Sendchamp's review — mirrors our order_confirmed copy.
  const sample = `Thanks for ordering from ${restaurant.name}! Your order is confirmed — we'll text you again when it's ready.`;

  const res = await fetch("https://api.sendchamp.com/api/v1/sms/create-sender-id", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SENDCHAMP_API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      name: senderName,
      sample,
      use_case: "Transactional",
    }),
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok || body.status !== "success") {
    console.error("Sendchamp create-sender-id failed:", res.status, body);
    return new Response(
      JSON.stringify({
        error: "Sendchamp registration failed",
        sendchamp_status: res.status,
        sendchamp_body: body,
      }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }

  const { error: updateErr } = await supabase
    .from("restaurants")
    .update({
      sms_sender_id: senderName,
      sms_sender_status: "pending",
      sms_sender_requested_at: new Date().toISOString(),
    })
    .eq("id", restaurantId);

  if (updateErr) {
    console.error("Failed to persist sender registration:", updateErr);
    return new Response(
      JSON.stringify({
        error: "Sendchamp accepted but DB update failed",
        sender_id: senderName,
        db_error: updateErr.message,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({
      ok: true,
      sender_id: senderName,
      status: "pending",
      sendchamp: body,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
