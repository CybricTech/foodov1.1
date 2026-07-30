import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/api/require-admin";

/**
 * Stop or resume automatic re-booking for one order.
 *
 * The brake on the auto-rebook loop. Re-booking otherwise continues until a
 * ride completes, which is right for a customer waiting on food they paid for
 * but wrong when the underlying problem is the address, the store, or a
 * customer who has given up — cases where each retry just buys another fare.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { order_id, stopped } = body as { order_id?: string; stopped?: boolean };
  if (!order_id || typeof stopped !== "boolean") {
    return NextResponse.json({ error: "order_id and stopped required" }, { status: 400 });
  }

  const serviceClient = createServiceClient();

  const { data: updated, error } = await serviceClient
    .from("orders")
    .update({
      bolt_autobook_stopped_at: stopped ? new Date().toISOString() : null,
      bolt_autobook_stopped_by: stopped ? auth.userId : null,
    })
    .eq("id", order_id)
    .select("id");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  await serviceClient.from("audit_logs").insert({
    actor_id: auth.userId,
    action: stopped ? "bolt_autobook_stopped" : "bolt_autobook_resumed",
    target_type: "order",
    target_id: order_id,
    metadata: {},
  });

  return NextResponse.json({ ok: true, stopped });
}
