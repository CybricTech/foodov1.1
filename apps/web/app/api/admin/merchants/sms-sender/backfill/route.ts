import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";

/**
 * One-shot backfill: registers Sendchamp sender IDs for every restaurant that
 * doesn't have one yet. Sequential to avoid hammering Sendchamp's API.
 *
 * Admin-only. Invoke once after the SMS feature ships:
 *   curl -X POST <host>/api/admin/merchants/sms-sender/backfill \
 *        -H "Cookie: <session>"
 */
export async function POST(_request: NextRequest) {
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

  const { data: restaurants } = await serviceClient
    .from("restaurants")
    .select("id, name")
    .is("sms_sender_id", null);

  if (!restaurants || restaurants.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, results: [] });
  }

  const results: Array<{
    id: string;
    name: string;
    ok: boolean;
    sender_id?: string;
    error?: string;
  }> = [];

  for (const r of restaurants) {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/register-sms-sender`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ restaurantId: r.id }),
      }
    );

    const body = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      sender_id?: string;
      error?: string;
    };

    results.push({
      id: r.id,
      name: r.name,
      ok: res.ok && body.ok === true,
      sender_id: body.sender_id,
      error: !res.ok || body.ok !== true ? body.error ?? `HTTP ${res.status}` : undefined,
    });
  }

  // Skip system-wide audit log entry (target_id is non-nullable on audit_logs);
  // per-restaurant audit trail is captured by the sms_sender_requested_at timestamps.

  return NextResponse.json({
    ok: true,
    processed: results.length,
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
}
