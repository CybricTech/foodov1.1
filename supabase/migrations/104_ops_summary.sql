-- ============================================================================
-- 104: Admin live-ops RPCs — platform summary, hourly curve, order drill-down
-- ============================================================================
-- The Live Operations dashboard (apps/web/app/admin/(protected)/page.tsx) v2
-- needs three aggregates the current client-side path cannot produce:
--
--   1. ops_summary       platform-wide KPIs over an arbitrary date range —
--                        today's numbers, last week's numbers, comparisons.
--   2. ops_hourly        the 24-hour Africa/Lagos volume curve for a day,
--                        including zero-traffic hours (client-side reduce
--                        over the 1000-row cap cannot).
--   3. ops_order_detail  a single order's drill-down: header, items,
--                        assignment and a timestamp timeline, in one call
--                        (the dashboard's expandable order card needs it).
--
-- Reconciliation rules (must match the dashboard's client behaviour):
--   • restaurants.is_test = false everywhere except the drill-down — the
--     dashboard excludes test/demo merchants (The Copper Pot, migration 069)
--     from KPIs, so the SQL side applies the same join to keep the numbers
--     identical whether or not the client remembers to filter.
--   • WAT day grouping: Africa/Lagos is UTC+1 year-round (no DST), so
--     (created_at AT TIME ZONE 'Africa/Lagos')::date is the same calendar
--     day the Lagos client sees (same convention as migration 098).
--   • gmv = SUM(total_kobo) WHERE payment_status = 'paid' — total_kobo is
--     BIGINT NOT NULL (migration 005), so no null-guard is needed on the
--     column itself; COALESCE(...,0) only covers empty FILTER sets.
--   • avg_prep_minutes is ALWAYS NULL. Orders have no confirmed_at / ready_at
--     column (status text only — grep migrations: step timestamps were never
--     materialised), so a true prep time cannot be computed from real
--     columns. delivered_at − created_at is measured and reported as
--     avg_delivery_minutes with an honest label: total order-to-door time.
--   • Averages computed from zero rows return NULL (renders "—" client-side),
--     never 0 — an empty day must not look like a ₦0 day.
--
-- Security: SECURITY DEFINER so the service-role client (admin server
-- components) can run them; authenticated callers must be super_admin —
-- finance_assert_admin() from migration 098, unchanged (also used by 099/100).
-- ============================================================================

-- ── Platform summary (single row) ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION ops_summary(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS TABLE (
  orders_count          BIGINT,
  gmv_kobo              BIGINT,
  delivered_count       BIGINT,
  cancelled_count       BIGINT,
  avg_prep_minutes      NUMERIC,
  avg_delivery_minutes  NUMERIC,
  avg_order_value_kobo  BIGINT,
  cancellation_rate     NUMERIC
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM finance_assert_admin();
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT,
    -- Paid-only revenue; cancelled/pending orders never contribute GMV.
    COALESCE(SUM(o.total_kobo) FILTER (WHERE o.payment_status = 'paid'), 0)::BIGINT,
    COUNT(*) FILTER (WHERE o.status = 'delivered')::BIGINT,
    COUNT(*) FILTER (WHERE o.status = 'cancelled')::BIGINT,
    -- Always NULL by design: no confirmed_at/ready_at column exists on orders,
    -- so true prep time is unknowable. See the banner comment.
    NULL::NUMERIC,
    -- Total order-to-door minutes over DELIVERED orders only; AVG skips rows
    -- where delivered_at IS NULL, so the FILTER is implicit.
    ROUND(AVG(EXTRACT(EPOCH FROM (o.delivered_at - o.created_at)) / 60.0))::NUMERIC,
    -- gmv / raw order count (spec formula). NULL on an empty range — a big
    -- fat zero here would render "₦0" against a "no orders" day.
    CASE WHEN COUNT(*) > 0
         THEN ROUND(SUM(o.total_kobo) FILTER (WHERE o.payment_status = 'paid')::NUMERIC
                    / COUNT(*))::BIGINT
         ELSE NULL END,
    -- cancelled / total, 4dp like finance_summary.take_rate. NULL when empty.
    CASE WHEN COUNT(*) > 0
         THEN ROUND((COUNT(*) FILTER (WHERE o.status = 'cancelled'))::NUMERIC
                    / COUNT(*), 4)
         ELSE NULL END
  FROM orders o
  JOIN restaurants r ON r.id = o.restaurant_id
  WHERE o.created_at >= p_from
    AND o.created_at <  p_to
    AND r.is_test = false;
END;
$$;

-- ── Daily series by hour (24 rows, Africa/Lagos) ────────────────────────────
CREATE OR REPLACE FUNCTION ops_hourly(p_day DATE)
RETURNS TABLE (
  hour              INTEGER,
  orders_count      BIGINT,
  gmv_kobo          BIGINT,
  delivered_count   BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM finance_assert_admin();
  RETURN QUERY
  WITH hours AS (
    -- Outer series drives the LEFT JOIN: every hour 0-23 comes back, even
    -- the zero-traffic ones the chart needs for a continuous axis.
    SELECT generate_series(0, 23)::INTEGER AS hour
  ),
  orders_of_day AS (
    SELECT
      EXTRACT(HOUR FROM (o.created_at AT TIME ZONE 'Africa/Lagos'))::INTEGER AS hour,
      o.total_kobo,
      o.payment_status,
      o.status
    FROM orders o
    JOIN restaurants r ON r.id = o.restaurant_id
    WHERE (o.created_at AT TIME ZONE 'Africa/Lagos')::date = p_day
      AND r.is_test = false
  )
  SELECT
    h.hour,
    COUNT(od.hour)::BIGINT,
    COALESCE(SUM(od.total_kobo) FILTER (WHERE od.payment_status = 'paid'), 0)::BIGINT,
    COUNT(od.hour) FILTER (WHERE od.status = 'delivered')::BIGINT
  FROM hours h
  LEFT JOIN orders_of_day od ON od.hour = h.hour
  GROUP BY h.hour
  ORDER BY h.hour;
END;
$$;

-- ── Single-order drill-down ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION ops_order_detail(p_order_id UUID)
RETURNS TABLE (
  id                    UUID,
  order_number          TEXT,
  status                TEXT,
  payment_status        TEXT,
  fulfillment_type      TEXT,
  total_kobo            BIGINT,
  subtotal_kobo         BIGINT,
  delivery_fee_kobo     BIGINT,
  service_fee_kobo      BIGINT,
  vat_kobo              BIGINT,
  customer_name         TEXT,
  customer_phone        TEXT,
  delivery_address      TEXT,
  special_instructions  TEXT,
  items                 JSONB,  -- OpsOrderItemDetail[]
  assignment            JSONB,  -- OpsAssignmentDetail | null
  timeline              JSONB   -- { label, at }[]
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM finance_assert_admin();
  RETURN QUERY
  SELECT
    o.id,
    o.order_number,
    o.status,
    o.payment_status,
    o.fulfillment_type,
    o.total_kobo,
    o.subtotal_kobo,
    o.delivery_fee_kobo,
    o.service_fee_kobo,
    o.vat_kobo,
    o.customer_name,
    o.customer_phone,
    o.delivery_address,
    o.special_instructions,
    it.items,
    asg.assignment,
    tl.timeline
  FROM orders o
  -- Items: order_items snapshots, kobo columns (migration 005).
  LEFT JOIN LATERAL (
    SELECT COALESCE(jsonb_agg(
             jsonb_build_object(
               'name',           oi.item_name,
               'quantity',       oi.quantity,
               'unit_price_kobo', oi.item_price_kobo,
               'total_kobo',     oi.line_total_kobo
             ) ORDER BY oi.id
           ), '[]'::jsonb) AS items
      FROM order_items oi
     WHERE oi.order_id = o.id
  ) it ON true
  -- Assignment: latest delivery_assignments row. Rider identity lives on
  -- user_profiles (full_name/phone) — delivery_assignments.rider_id points
  -- at user_profiles.id; platform_riders only carries ops/earnings columns.
  -- NULL when the order has no assignment (e.g. pickups, in-house lanes).
  LEFT JOIN LATERAL (
    SELECT jsonb_build_object(
             'rider_name',  up.full_name,
             'rider_phone', up.phone,
             'assigned_at', da.assigned_at,
             'picked_up_at', da.picked_up_at,
             'delivered_at', da.delivered_at
           ) AS assignment
      FROM delivery_assignments da
      LEFT JOIN user_profiles up ON up.id = da.rider_id
     WHERE da.order_id = o.id
     ORDER BY da.assigned_at ASC NULLS LAST
     LIMIT 1
  ) asg ON true
  -- Timeline: only timestamps that actually exist on the schema. Order placed
  -- (created_at) → assigned → picked up → delivered → last update. Rows with
  -- NULL at are dropped; "Last update" sorts after a same-instant "Delivered".
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
             jsonb_build_object('label', t.label, 'at', t.at)
             ORDER BY t.at ASC, CASE t.label WHEN 'Last update' THEN 1 ELSE 0 END
           ) AS timeline
      FROM (
        SELECT 'Order placed'::TEXT AS label, o.created_at AS at
        UNION ALL
        SELECT 'Assigned to rider', da.assigned_at
          FROM delivery_assignments da WHERE da.order_id = o.id AND da.assigned_at IS NOT NULL
        UNION ALL
        SELECT 'Picked up', da.picked_up_at
          FROM delivery_assignments da WHERE da.order_id = o.id AND da.picked_up_at IS NOT NULL
        UNION ALL
        SELECT 'Delivered', da.delivered_at
          FROM delivery_assignments da WHERE da.order_id = o.id AND da.delivered_at IS NOT NULL
        UNION ALL
        SELECT 'Last update', o.updated_at
      ) t
     WHERE t.at IS NOT NULL
  ) tl ON true
  WHERE o.id = p_order_id;
END;
$$;

-- ── Permissions ─────────────────────────────────────────────────────────────
-- Grant alignment with 20260809101856_rls_hardening_function_execute.sql:
-- no anon/authenticated EXECUTE anywhere on the public schema. Every caller
-- (admin server components) uses the service client; finance_assert_admin()
-- remains as defense-in-depth for any future authenticated grant.
REVOKE ALL ON FUNCTION ops_summary(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION ops_hourly(DATE) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION ops_order_detail(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ops_summary(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION ops_hourly(DATE) TO service_role;
GRANT EXECUTE ON FUNCTION ops_order_detail(UUID) TO service_role;