import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Admin actions for a restaurant's Sendchamp sender ID:
 *   - "register": (re)trigger the Sendchamp registration Edge Function
 *   - "approve" : mark sms_sender_status = 'approved' (after checking Sendchamp dashboard)
 *   - "reject"  : mark sms_sender_status = 'rejected'
 *   - "reset"   : clear sender_id + status so it can be re-registered
 */
type Action = "register" | "approve" | "reject" | "reset";

export async function POST(request: NextRequest) {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceClient = createServiceClient();
  const { data: profile } = await serviceClient
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { restaurantId?: string; action?: Action };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { restaurantId, action } = body;
  if (!restaurantId || !action) {
    return NextResponse.json(
      { error: "restaurantId and action required" },
      { status: 400 }
    );
  }

  if (action === "register") {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/register-sms-sender`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ restaurantId }),
      }
    );
    const result = await res.json().catch(() => ({}));
    return NextResponse.json(result, { status: res.status });
  }

  if (action === "approve" || action === "reject") {
    const { error } = await serviceClient
      .from("restaurants")
      .update({ sms_sender_status: action === "approve" ? "approved" : "rejected" })
      .eq("id", restaurantId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await serviceClient.from("audit_logs").insert({
      actor_id: user.id,
      action: `sms_sender_${action}`,
      target_type: "restaurant",
      target_id: restaurantId,
      metadata: {},
    });

    return NextResponse.json({ success: true });
  }

  if (action === "reset") {
    const { error } = await serviceClient
      .from("restaurants")
      .update({
        sms_sender_id: null,
        sms_sender_status: null,
        sms_sender_requested_at: null,
      })
      .eq("id", restaurantId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await serviceClient.from("audit_logs").insert({
      actor_id: user.id,
      action: "sms_sender_reset",
      target_type: "restaurant",
      target_id: restaurantId,
      metadata: {},
    });

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
