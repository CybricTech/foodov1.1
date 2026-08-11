import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/require-admin";
import { createServiceClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export { type OpsOrderDetail } from "@/lib/admin/ops-types";

export const dynamic = "force-dynamic";

// Syntax gate for the UUID query param before it reaches the RPC — matches
// the uuid format stored on orders.id (001_initial_schema.sql). The RPC is
// the authority on existence; this only rejects malformed input.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const orderId = request.nextUrl.searchParams.get("orderId");
  if (!orderId) {
    return NextResponse.json(
      { error: "orderId query parameter is required" },
      { status: 400 }
    );
  }
  if (!UUID_RE.test(orderId)) {
    return NextResponse.json(
      { error: "orderId must be a valid UUID" },
      { status: 400 }
    );
  }

  // ops_order_detail is not in the generated @foodo/database types yet (it
  // ships with migration 104) — call it through an untyped view of the same
  // service client. Response contract: OpsOrderDetail, re-exported above.
  const supabase = createServiceClient() as unknown as SupabaseClient;
  const { data, error } = await supabase.rpc("ops_order_detail", {
    p_order_id: orderId,
  });

  if (error) {
    console.error("ops_order_detail failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const detail = data?.[0] ?? null;
  if (!detail) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  return NextResponse.json(detail);
}