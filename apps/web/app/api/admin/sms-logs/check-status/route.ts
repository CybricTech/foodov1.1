import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/admin/sms-logs/check-status
 *
 * Fetches the latest delivery status from Sendchamp for a single SMS log entry
 * and updates sms_logs.status accordingly.
 *
 * Body: { logId: string }
 */

const SENDCHAMP_STATUS_MAP: Record<string, "queued" | "sent" | "delivered" | "failed"> = {
  SENT: "sent",
  DELIVERED: "delivered",
  PENDING: "queued",
  FAILED: "failed",
  "LOW FUNDS": "failed",
  REJECTED: "failed",
  EXPIRED: "failed",
};

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

  let body: { logId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { logId } = body;
  if (!logId) {
    return NextResponse.json({ error: "logId required" }, { status: 400 });
  }

  const { data: log, error: logErr } = await serviceClient
    .from("sms_logs")
    .select("id, provider, provider_ref, status")
    .eq("id", logId)
    .single();

  if (logErr || !log) {
    return NextResponse.json({ error: "Log not found" }, { status: 404 });
  }

  if (log.provider !== "sendchamp") {
    return NextResponse.json(
      { error: "Delivery status check is only available for Sendchamp messages" },
      { status: 400 }
    );
  }

  if (!log.provider_ref) {
    return NextResponse.json(
      { error: "No Sendchamp message ID on file for this log entry" },
      { status: 400 }
    );
  }

  const res = await fetch(
    `https://api.sendchamp.com/api/v1/sms/status/${log.provider_ref}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.SENDCHAMP_API_KEY}`,
        Accept: "application/json",
      },
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return NextResponse.json(
      { error: "Sendchamp status check failed", sendchamp_status: res.status, body: text },
      { status: 502 }
    );
  }

  const data = await res.json().catch(() => ({}));

  // Sendchamp returns status as uppercase string inside data object
  const rawStatus: string = (data.data?.status ?? data.status ?? "").toString().toUpperCase();
  const mappedStatus = SENDCHAMP_STATUS_MAP[rawStatus] ?? log.status;

  if (mappedStatus !== log.status) {
    await serviceClient
      .from("sms_logs")
      .update({
        status: mappedStatus,
        ...(mappedStatus === "sent" || mappedStatus === "delivered"
          ? { sent_at: new Date().toISOString() }
          : {}),
      })
      .eq("id", logId);
  }

  return NextResponse.json({
    ok: true,
    logId,
    rawStatus,
    status: mappedStatus,
    changed: mappedStatus !== log.status,
  });
}
