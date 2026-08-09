import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/api/require-admin";

export const dynamic = "force-dynamic";

const MAX_LIMIT = 200;

/**
 * Filterable read over public.audit_trail (the activity_log + auth_events
 * union — see migration 20260809140000_audit_trail_view). Admin-only.
 *
 * Query params:
 *   restaurantId  — scope to one merchant (used by the merchant detail Activity tab)
 *   actorId       — scope to one person
 *   source        — "activity" | "auth" (omit for both)
 *   table         — activity_log.table_name, or "sign_in"/"sign_out" for auth rows
 *   before        — ISO timestamp cursor; returns rows strictly before it
 *   limit         — default 100, capped at 200
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(req.url);
  const restaurantId = searchParams.get("restaurantId");
  const actorId = searchParams.get("actorId");
  const source = searchParams.get("source");
  const table = searchParams.get("table");
  const before = searchParams.get("before");
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(searchParams.get("limit")) || 100)
  );

  const supabase = createServiceClient();
  let query = supabase
    .from("audit_trail")
    .select(
      "id, source, created_at, table_name, operation, restaurant_id, restaurant_name, actor_id, actor_email, actor_name, actor_role_label, detail"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (restaurantId) query = query.eq("restaurant_id", restaurantId);
  if (actorId) query = query.eq("actor_id", actorId);
  if (source === "activity" || source === "auth") query = query.eq("source", source);
  if (table) query = query.eq("table_name", table);
  if (before) query = query.lt("created_at", before);

  const { data, error } = await query;

  if (error) {
    console.error("[api/admin/audit] error:", error.message);
    return NextResponse.json({ error: "Failed to load audit trail" }, { status: 500 });
  }

  return NextResponse.json(
    { rows: data ?? [] },
    { headers: { "Cache-Control": "no-store" } }
  );
}
