// ============================================================================
// Admin Live-Ops data contract — column-for-column mirror of the RPCs in
// supabase/migrations/104_ops_summary.sql
//
//   ops_summary      (TIMESTAMPTZ, TIMESTAMPTZ) → ops_summary row   (OpsSummary)
//   ops_hourly       (DATE)                     → 24 rows, hour 0-23 (OpsHourlyRow)
//   ops_order_detail (UUID)                     → 1 row              (OpsOrderDetail)
//
// Conventions (match the rest of the admin app):
//   • snake_case keys, exactly as the RPC output columns are named
//   • currency in kobo integers (BIGINT in SQL → number here)
//   • NULL means "not computable / absent", and renders "—" client-side —
//     e.g. avg_prep_minutes is ALWAYS null: the schema has no confirmed_at /
//     ready_at column, so a true prep time cannot be measured (see 104).
//   • avg_order_value_kobo / cancellation_rate are null only when the range
//     contains zero orders.
//
// This file is types only — no runtime code. Do NOT add these types to
// packages/database/src/types.ts (that file is generated).
// ============================================================================

import type {
  LiveOrderRow,
  MerchantRow,
} from "@/components/admin/live-ops-client";

// ── ops_summary(p_from, p_to) → single row ─────────────────────────────────

export interface OpsSummary {
  /** Raw order count for the range — ALL statuses, including cancelled. */
  orders_count: number;
  /** Sum of total_kobo where payment_status = 'paid'. Bigint → number (kobo). */
  gmv_kobo: number;
  /** Orders with status = 'delivered'. */
  delivered_count: number;
  /** Orders with status = 'cancelled'. */
  cancelled_count: number;
  /**
   * ALWAYS null — the schema has no confirmed_at / ready_at column, so true
   * prep time cannot be measured. delivered_at − created_at is total
   * order-to-door time and is reported as avg_delivery_minutes instead.
   */
  avg_prep_minutes: number | null;
  /**
   * Mean (delivered_at − created_at) in minutes over delivered orders.
   * Total fulfillment time, not prep time — created_at is the only start
   * timestamp the schema records. Null when no delivered orders in range.
   */
  avg_delivery_minutes: number | null;
  /** gmv_kobo / orders_count, whole kobo. Null when orders_count = 0. */
  avg_order_value_kobo: number | null;
  /** cancelled_count / orders_count (0..1, 4dp). Null when orders_count = 0. */
  cancellation_rate: number | null;
}

// ── ops_hourly(p_day) → 24 rows (0-23, Africa/Lagos) ────────────────────────

export interface OpsHourlyRow {
  /** Local hour of day in Africa/Lagos — always 0..23, one row per hour. */
  hour: number;
  orders_count: number;
  /** Paid-only total_kobo, kobo. */
  gmv_kobo: number;
  delivered_count: number;
}

// ── ops_order_detail(p_order_id) → single row ───────────────────────────────

export interface OpsOrderItemDetail {
  /** order_items.item_name — snapshot at time of order. */
  name: string;
  quantity: number;
  /** order_items.item_price_kobo. */
  unit_price_kobo: number;
  /** order_items.line_total_kobo. */
  total_kobo: number;
}

export interface OpsAssignmentDetail {
  /** user_profiles.full_name of delivery_assignments.rider_id — null on own/third-party lanes. */
  rider_name: string | null;
  /** user_profiles.phone of delivery_assignments.rider_id. */
  rider_phone: string | null;
  /** delivery_assignments.assigned_at — NOT NULL on a live assignment row. */
  assigned_at: string | null;
  /** delivery_assignments.picked_up_at — null until the rider collects. */
  picked_up_at: string | null;
  /** delivery_assignments.delivered_at — null until dropped off. */
  delivered_at: string | null;
}

export interface OpsOrderDetail {
  id: string;
  order_number: string;
  status: string;
  payment_status: string;
  fulfillment_type: string;
  total_kobo: number;
  subtotal_kobo: number;
  delivery_fee_kobo: number;
  service_fee_kobo: number;
  vat_kobo: number;
  customer_name: string | null;
  customer_phone: string | null;
  delivery_address: string | null;
  special_instructions: string | null;
  items: OpsOrderItemDetail[];
  /** Null when the order has no delivery_assignments row (e.g. pickup). */
  assignment: OpsAssignmentDetail | null;
  /**
   * Events built from real timestamps only: created_at, assigned_at,
   * picked_up_at, delivered_at, updated_at — ascending, nulls dropped.
   */
  timeline: { label: string; at: string }[];
}

// ── LiveOpsClient props (v2) ────────────────────────────────────────────────
// Existing props are untouched and keep the exact row types the client
// component already exports; the four new props are fed by the 104 RPCs.
//
// summaryToday / summaryLastWeek are NULLABLE: null means "ops_summary was
// unavailable at request time" (RPC error or zero rows). The client then
// falls back to realtime-derived values for the KPI / secondary / SLA rows
// instead of showing zeroed RPC values.

export interface LiveOpsClientProps {
  initialMerchants: MerchantRow[];
  initialOrders: LiveOrderRow[];
  ridersOnline: number;
  pendingSettlements: number;
  /**
   * Server render timestamp (ms epoch), used to seed the client's `now` /
   * `lastSync` state. Must come from the server render, not `Date.now()`
   * called client-side — otherwise the SSR HTML and the client's first
   * render compute it at two different instants, and any value derived
   * from it (age/lateness minutes) can land on opposite sides of a minute
   * boundary and trip a hydration mismatch.
   */
  initialNowMs: number;
  /**
   * ops_summary for today (Africa/Lagos).
   * null = RPC unavailable at request time → client uses realtime-derived
   * values (GMV, orders/delivered/cancelled counts, SLA all "—").
   */
  summaryToday: OpsSummary | null;
  /**
   * ops_summary for the trailing 7 days, for comparison headers.
   * null = RPC unavailable at request time → delta badge hidden.
   */
  summaryLastWeek: OpsSummary | null;
  /** ops_hourly(today) — 24 rows, hour 0-23. */
  hourlyToday: OpsHourlyRow[];
  /** ops_hourly(yesterday) — 24 rows, hour 0-23. */
  hourlyYesterday: OpsHourlyRow[];
}