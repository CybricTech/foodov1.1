import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/server";
import type {
  LiveOpsClientProps,
  OpsHourlyRow,
  OpsSummary,
} from "@/lib/admin/ops-types";
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

// Africa/Lagos is UTC+1 year-round (no DST) — ops_summary takes UTC-instant
// bounds, ops_hourly takes WAT calendar dates (see migration 104).
const WAT_OFFSET_MS = 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

export default async function AdminLiveOpsPage() {
  const supabase = createServiceClient();

  // The 104 RPCs (ops_summary / ops_hourly) aren't in the generated
  // @foodo/database types yet — they ship with this migration — so the four
  // new calls go through an untyped view of the same service client. Row
  // contracts live in @/lib/admin/ops-types (column-for-column with 104).
  const opsClient = supabase as unknown as SupabaseClient;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayStartISO = todayStart.toISOString();

  // WAT calendar today + its UTC-instant bounds for the 104 aggregates.
  const nowMs = Date.now();
  const watNow = new Date(nowMs + WAT_OFFSET_MS);
  const watToday = watNow.toISOString().slice(0, 10); // YYYY-MM-DD
  const todayStartUTC = new Date(
    Date.parse(`${watToday}T00:00:00Z`) - WAT_OFFSET_MS
  );
  const [watYear, watMonth, watDay] = watToday.split("-").map(Number);
  const watYesterday = new Date(Date.UTC(watYear, watMonth - 1, watDay - 1))
    .toISOString()
    .slice(0, 10); // YYYY-MM-DD

  const [
    { data: merchants },
    { data: orders },
    { count: ridersOnline },
    { count: pendingSettlements },
    summaryTodayRes,
    summaryLastWeekRes,
    hourlyTodayRes,
    hourlyYesterdayRes,
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
      // Keep in sync with SERVER_ORDER_CAP in components/admin/live-ops-client:
      // the client treats a snapshot of exactly this size as truncated and
      // stops trusting it to say which orders left the board.
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

    // ── v2 KPIs — 104 RPCs (service client, same idiom as finance page) ─────
    // Today: Africa/Lagos midnight → midnight + 24h (UTC instants).
    opsClient.rpc("ops_summary", {
      p_from: todayStartUTC.toISOString(),
      p_to: new Date(todayStartUTC.getTime() + 24 * HOUR_MS).toISOString(),
    }),
    // Trailing 7 days: rolling window ending now.
    opsClient.rpc("ops_summary", {
      p_from: new Date(nowMs - 7 * 24 * HOUR_MS).toISOString(),
      p_to: new Date(nowMs).toISOString(),
    }),
    // 24-row Africa/Lagos hourly curves — WAT calendar dates.
    opsClient.rpc("ops_hourly", { p_day: watToday }),
    opsClient.rpc("ops_hourly", { p_day: watYesterday }),
  ]);

  if (summaryTodayRes.error) console.error("ops_summary(today) failed:", summaryTodayRes.error);
  if (summaryLastWeekRes.error) console.error("ops_summary(7d) failed:", summaryLastWeekRes.error);
  if (hourlyTodayRes.error) console.error("ops_hourly(today) failed:", hourlyTodayRes.error);
  if (hourlyYesterdayRes.error) console.error("ops_hourly(yesterday) failed:", hourlyYesterdayRes.error);

  // ops_summary is a single-row set-returning function (finance page idiom).
  // null = RPC unavailable at request time (error or zero rows) — the client
  // falls back to realtime-derived values for the KPI / secondary / SLA rows
  // so the board never shows ₦0/0 while the realtime snapshot has orders.
  const summaryToday: OpsSummary | null = summaryTodayRes.error
    ? null
    : (summaryTodayRes.data?.[0] ?? null);
  const summaryLastWeek: OpsSummary | null = summaryLastWeekRes.error
    ? null
    : (summaryLastWeekRes.data?.[0] ?? null);
  const hourlyToday: OpsHourlyRow[] = hourlyTodayRes.data ?? [];
  const hourlyYesterday: OpsHourlyRow[] = hourlyYesterdayRes.data ?? [];

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

  // v2 props contract (lib/admin/ops-types). Built as the full contract and
  // spread (not named props) because LiveOpsClient's inline prop type doesn't
  // declare the four 104-fed props yet — spreads bypass JSX excess-property
  // checks while the whole object stays type-checked against the contract.
  const liveOpsProps: LiveOpsClientProps = {
    initialMerchants: realMerchants,
    initialOrders: realOrders,
    ridersOnline: ridersOnline ?? 0,
    pendingSettlements: pendingSettlements ?? 0,
    initialNowMs: nowMs,
    summaryToday,
    summaryLastWeek,
    hourlyToday,
    hourlyYesterday,
  };

  return <LiveOpsClient {...liveOpsProps} />;
}
