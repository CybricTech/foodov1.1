-- ============================================================================
-- 061: Performance indexes for the merchant dashboard
-- ============================================================================
-- Source: production Sentry trace data (14d) showed two unindexed access paths
-- dominating dashboard latency:
--
--   1. recompute_restaurant_wallet() (migration 059) — avg 6.4s, p95 15s.
--      For every unsettled order it runs a correlated subquery:
--        SELECT da.dispatch_type FROM delivery_assignments da
--         WHERE da.order_id = o.id ORDER BY da.assigned_at DESC LIMIT 1
--      delivery_assignments had NO index on order_id, so each lookup was a
--      sequential scan → O(unsettled_orders × assignments). This recompute runs
--      synchronously on every /dashboard/wallet load.
--
--   2. /dashboard/orders (and every order-detail page) — GET orders avg 1.3s.
--      The page joins order_items, which Postgres resolves as
--      `... WHERE order_id IN (...)`. order_items.order_id is a foreign key, and
--      Postgres does NOT auto-index FK columns, so the join was unindexed too.
--
-- Both indexes below are purely additive — no behavioural or schema change.
--
-- NOTE: these run inside the migration transaction (Supabase CLI default), so
-- CREATE INDEX takes a brief lock that blocks writes on each table while the
-- index builds. Both tables are small enough that this is sub-second in
-- practice. For a very large table you would instead run
-- `CREATE INDEX CONCURRENTLY` manually, outside a transaction.
-- ============================================================================

-- ── 1. Latest delivery assignment per order ─────────────────────────────────
-- Serves both foodo_resolved_dispatch_type() and the recompute's inline
-- correlated subquery: equality on order_id, then newest assigned_at first.
CREATE INDEX IF NOT EXISTS delivery_assignments_order_recent
  ON delivery_assignments (order_id, assigned_at DESC);

-- ── 2. Order items by parent order ──────────────────────────────────────────
-- Serves the order_items join on the orders queue and order-detail pages.
CREATE INDEX IF NOT EXISTS order_items_order
  ON order_items (order_id);
