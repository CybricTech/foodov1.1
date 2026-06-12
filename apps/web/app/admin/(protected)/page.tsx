import { createServiceClient } from "@/lib/supabase/server";
import {
  LiveOpsClient,
  type LiveOrderRow,
  type MerchantRow,
} from "@/components/admin/live-ops-client";

export const dynamic = "force-dynamic";

const ACTIVE_STATUSES = [
  "pending",
  "confirmed",
  "preparing",
  "ready_for_pickup",
  "assigned_to_rider",
  "in_transit",
];

export default async function AdminLiveOpsPage() {
  const supabase = createServiceClient();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayStartISO = todayStart.toISOString();

  const [
    { data: merchants },
    { data: orders },
    { count: ridersOnline },
    { count: pendingSettlements },
  ] = await Promise.all([
    // Every active merchant on the platform (open state computed client-side
    // from accepts_orders + opening_hours, kept live via realtime).
    // is_test merchants (demo restaurants like The Copper Pot) are excluded
    // below — they stay fully functional but never appear in live ops/KPIs.
    supabase
      .from("restaurants")
      .select(
        "id, name, slug, logo_url, accepts_orders, opening_hours, closure_message, city, estimated_delivery_minutes, is_test"
      )
      .eq("is_active", true)
      .order("name"),

    // Every in-flight order (any age) + everything created today.
    // This powers the merchant board, pipeline, KPIs and live feed.
    supabase
      .from("orders")
      .select(
        "id, restaurant_id, order_number, status, payment_status, fulfillment_type, dispatch_type, total_kobo, customer_name, customer_phone, delivery_address, special_instructions, created_at, updated_at, estimated_delivery_at, delivered_at, cancelled_reason"
      )
      .or(
        `created_at.gte.${todayStartISO},status.in.(${ACTIVE_STATUSES.join(",")})`
      )
      .order("created_at", { ascending: false })
      .limit(1000),

    // Riders online right now (server-only — RLS blocks anon reads)
    supabase
      .from("platform_riders")
      .select("id", { count: "exact", head: true })
      .eq("is_online", true),

    // Settlements needing attention
    supabase
      .from("settlements")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending", "processing"]),
  ]);

  // Exclude test/demo restaurants and their orders from live ops + KPIs.
  const allMerchants =
    (merchants as unknown as (MerchantRow & { is_test?: boolean })[]) ?? [];
  const realMerchants = allMerchants.filter((m) => !m.is_test);
  const testIds = new Set(
    allMerchants.filter((m) => m.is_test).map((m) => m.id)
  );
  const realOrders = ((orders as unknown as LiveOrderRow[]) ?? []).filter(
    (o) => !testIds.has(o.restaurant_id)
  );

  return (
    <LiveOpsClient
      initialMerchants={realMerchants}
      initialOrders={realOrders}
      ridersOnline={ridersOnline ?? 0}
      pendingSettlements={pendingSettlements ?? 0}
    />
  );
}
