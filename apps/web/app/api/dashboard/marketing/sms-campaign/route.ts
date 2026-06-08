import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getRequestUser } from "@/lib/supabase/get-request-user";

const SENDCHAMP_API = "https://api.sendchamp.com/api/v1/sms/send";
const DEFAULT_SENDER = process.env.SENDCHAMP_DEFAULT_SENDER_ID ?? "Kitchyn";
// Confirmed empirically (delivery to a real handset): SMS deliver only on the
// "non_dnd" route with a registered sender ID. The "dnd" route gets carrier-
// rejected on this account. Matches the route used by transactional order SMS.
const SENDCHAMP_ROUTE = process.env.SENDCHAMP_ROUTE ?? "non_dnd";

// SMS campaigns are gated "coming soon" until the discount/targeting work they
// depend on ships. The UI blocks interaction; this is the server-side backstop
// so the endpoint can't be hit directly. Flip to false to enable.
const SMS_CAMPAIGNS_COMING_SOON = true;

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("234")) return digits;
  if (digits.length === 11 && digits.startsWith("0")) return "234" + digits.slice(1);
  if (digits.length === 10) return "234" + digits;
  return digits;
}

async function sendOneSms(phone: string, message: string, senderName: string) {
  const res = await fetch(SENDCHAMP_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SENDCHAMP_API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    // Send to ONE number as a string (not an array): SendChamp then returns a
    // per-message id/reference ("MN-SMS-…") we can track. The array form only
    // returns a batch business_id with no usable per-message identifier.
    body: JSON.stringify({ to: normalizePhone(phone), message, sender_name: senderName, route: SENDCHAMP_ROUTE }),
  });
  const data = await res.json().catch(() => ({}));
  // SendChamp can return HTTP 200 with a body status of "error" (bad sender,
  // low funds, etc.), so a send is only truly accepted when both agree.
  const ok = res.ok && data?.status === "success";
  if (!ok) {
    console.error("Sendchamp marketing send failed:", res.status, JSON.stringify(data));
  }
  return { ok, data };
}

export async function POST(request: NextRequest) {
  if (SMS_CAMPAIGNS_COMING_SOON) {
    return NextResponse.json(
      { error: "SMS campaigns aren't available yet — coming soon." },
      { status: 503 }
    );
  }

  // Accept a mobile Bearer token OR the web cookie session. Scope is then
  // derived from the caller's own merchant profile (never a client-supplied id),
  // so every downstream query below stays bound to the authenticated
  // restaurant — matching the other dashboard routes and preserving behavior.
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const serviceClient = createServiceClient();

  const { data: callerProfile } = await serviceClient
    .from("user_profiles")
    .select("role, restaurant_id")
    .eq("id", user.id)
    .single();

  if (
    !callerProfile ||
    !["merchant_owner", "merchant_staff"].includes(callerProfile.role) ||
    !callerProfile.restaurant_id
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const restaurantId = callerProfile.restaurant_id;

  let body: { audience?: string; message?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { audience = "all", message } = body;

  if (!message?.trim()) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }
  if (message.length > 612) {
    return NextResponse.json({ error: "Message too long (max 4 SMS / 612 chars)" }, { status: 400 });
  }
  if (!["all", "inactive_30", "vip"].includes(audience)) {
    return NextResponse.json({ error: "Invalid audience" }, { status: 400 });
  }

  const { data: restaurant } = await serviceClient
    .from("restaurants")
    .select("name, sms_sender_id, sms_sender_status")
    .eq("id", restaurantId)
    .single();

  if (!restaurant) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }

  const senderName =
    restaurant.sms_sender_status === "approved" && restaurant.sms_sender_id
      ? restaurant.sms_sender_id
      : DEFAULT_SENDER;

  // Build audience query
  let query = serviceClient
    .from("customers")
    .select("id, full_name, phone")
    .eq("restaurant_id", restaurantId)
    .not("phone", "is", null);

  if (audience === "inactive_30") {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    query = query.or(`last_order_at.is.null,last_order_at.lt.${cutoff.toISOString()}`);
  } else if (audience === "vip") {
    query = query.gte("total_orders", 3);
  }

  const { data: customers } = await query.limit(500);

  if (!customers?.length) {
    return NextResponse.json({ ok: true, total: 0, sent: 0, failed: 0 });
  }

  // Send with full concurrency — cap enforced by the limit(500) above
  const sends = customers.map((c) => {
    const firstName = c.full_name?.split(" ")[0] ?? "Customer";
    const body = message.replace(/\{name\}/gi, firstName);
    return sendOneSms(c.phone!, body, senderName).then((r) => ({ ...r, customer: c, body }));
  });

  const results = await Promise.allSettled(sends);

  let sent = 0;
  let failed = 0;

  const logRows = results.map((r, i) => {
    const customer = customers[i];
    const ok = r.status === "fulfilled" && r.value.ok;
    const providerRef =
      r.status === "fulfilled"
        ? (r.value.data?.data?.id ?? r.value.data?.data?.reference ?? null)
        : null;
    const personalizedBody =
      r.status === "fulfilled"
        ? r.value.body
        : message.replace(/\{name\}/gi, customer.full_name?.split(" ")[0] ?? "Customer");

    if (ok) sent++; else failed++;

    return {
      restaurant_id: restaurantId,
      recipient_phone: customer.phone!,
      message_body: personalizedBody,
      event_type: "marketing_campaign",
      provider: "sendchamp",
      provider_ref: providerRef,
      status: ok ? "sent" : "failed",
      channel: "sms",
      sent_at: ok ? new Date().toISOString() : null,
    };
  });

  await serviceClient.from("sms_logs").insert(logRows);

  return NextResponse.json({ ok: true, total: customers.length, sent, failed });
}
