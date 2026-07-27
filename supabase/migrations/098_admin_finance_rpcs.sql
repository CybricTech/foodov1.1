-- ============================================================================
-- 098: Admin finance RPCs — platform-wide unit economics & P&L aggregation
-- ============================================================================
-- The settlements page aggregates client-side over a 500-order cap; the new
-- /admin/finance section needs platform-wide, date-ranged aggregation in SQL.
--
-- The per-order economics mirror the "Kitchyn P&L" tab in
-- apps/web/components/admin/settlements-client.tsx EXACTLY (same order filter,
-- same merchant filter, same formulas — the finance Overview must reconcile
-- with that tab day-for-day):
--
--   order filter:   orders.status NOT IN ('cancelled','pending')
--   merchant filter: restaurants.paystack_recipient_code IS NOT NULL
--                    (only merchants whose GMV actually lands in our Paystack)
--   p_total        = COALESCE(total_kobo, subtotal+vat+delivery+service_fee)
--   gateway_fee    = MIN(ROUND(p_total*1.5%) + (₦100 if p_total >= ₦2,500), ₦2,000)
--                    — per order, never on aggregates (see @foodo/utils gatewayFee)
--   merchant_charge= ROUND(p_total * platform_settings.merchant_charge_pct)
--   delivery margin:
--       platform_rider, delivered & cost known → delivery_fee − delivery_cost
--       own_rider / third_party                → ROUND(delivery_fee * dc_pct)
--       dc_pct = COALESCE(restaurant override, platform default, 0.10)
--   foodo_net      = service_fee + merchant_charge + delivery_margin − gateway_fee
--
-- WAT day grouping: settlements-client adds 1h to UTC; Africa/Lagos is UTC+1
-- year-round (no DST), so (created_at AT TIME ZONE 'Africa/Lagos')::date is
-- the same calendar day.
--
-- Security: SECURITY DEFINER so the service-role client (admin server
-- components) can run them; authenticated callers must be super_admin.
-- ============================================================================

-- ── Guard helper ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION finance_assert_admin()
RETURNS VOID
LANGUAGE plpgsql STABLE
SET search_path = public
AS $$
BEGIN
  -- service_role (admin server components) bypasses; authenticated users must
  -- be super_admin; anon is rejected.
  IF auth.role() = 'authenticated' AND get_my_role() <> 'super_admin' THEN
    RAISE EXCEPTION 'forbidden: super_admin required';
  END IF;
  IF auth.role() = 'anon' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
END;
$$;

-- ── Per-order economic base rows ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION finance_order_economics(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS TABLE (
  order_id                UUID,
  restaurant_id           UUID,
  restaurant_name         TEXT,
  created_at              TIMESTAMPTZ,
  wat_date                DATE,
  status                  TEXT,
  payment_status          TEXT,
  dispatch_type           TEXT,
  fulfillment_type        TEXT,
  order_total_kobo        BIGINT,
  subtotal_kobo           BIGINT,
  vat_kobo                BIGINT,
  discount_kobo           BIGINT,
  delivery_fee_kobo       BIGINT,
  service_fee_kobo        BIGINT,
  delivery_cost_kobo      BIGINT,
  gateway_fee_kobo        BIGINT,
  merchant_charge_kobo    BIGINT,
  own_commission_kobo     BIGINT,
  platform_delivery_margin_kobo BIGINT,
  delivery_margin_kobo    BIGINT,
  platform_delivery_pending BOOLEAN,
  foodo_net_kobo          BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mc_pct NUMERIC;
  v_dc_pct NUMERIC;
BEGIN
  PERFORM finance_assert_admin();

  SELECT ps.merchant_charge_pct, ps.delivery_commission_pct
    INTO v_mc_pct, v_dc_pct
    FROM platform_settings ps LIMIT 1;
  v_mc_pct := COALESCE(v_mc_pct, 0.01);
  v_dc_pct := COALESCE(v_dc_pct, 0.10);

  RETURN QUERY
  SELECT
    o.id,
    o.restaurant_id,
    r.name,
    o.created_at,
    (o.created_at AT TIME ZONE 'Africa/Lagos')::date,
    o.status,
    o.payment_status,
    o.dispatch_type,
    o.fulfillment_type,
    COALESCE(o.total_kobo,
      COALESCE(o.subtotal_kobo,0) + COALESCE(o.vat_kobo,0)
      + COALESCE(o.delivery_fee_kobo,0) + COALESCE(o.service_fee_kobo,0))::BIGINT,
    COALESCE(o.subtotal_kobo,0)::BIGINT,
    COALESCE(o.vat_kobo,0)::BIGINT,
    COALESCE(o.discount_kobo,0)::BIGINT,
    COALESCE(o.delivery_fee_kobo,0)::BIGINT,
    COALESCE(o.service_fee_kobo,0)::BIGINT,
    o.delivery_cost_kobo,
    -- gateway fee, per order (flat ₦100 must scale with txn count)
    LEAST(
      ROUND(COALESCE(o.total_kobo,
        COALESCE(o.subtotal_kobo,0) + COALESCE(o.vat_kobo,0)
        + COALESCE(o.delivery_fee_kobo,0) + COALESCE(o.service_fee_kobo,0)) * 0.015)
      + CASE WHEN COALESCE(o.total_kobo,
        COALESCE(o.subtotal_kobo,0) + COALESCE(o.vat_kobo,0)
        + COALESCE(o.delivery_fee_kobo,0) + COALESCE(o.service_fee_kobo,0)) >= 250000
             THEN 10000 ELSE 0 END,
      200000
    )::BIGINT,
    ROUND(COALESCE(o.total_kobo,
      COALESCE(o.subtotal_kobo,0) + COALESCE(o.vat_kobo,0)
      + COALESCE(o.delivery_fee_kobo,0) + COALESCE(o.service_fee_kobo,0)) * v_mc_pct)::BIGINT,
    -- our commission slice on merchant-handled deliveries
    CASE
      WHEN o.dispatch_type IN ('own_rider','third_party')
        THEN ROUND(COALESCE(o.delivery_fee_kobo,0)
             * COALESCE(r.delivery_commission_pct, v_dc_pct, 0.10))
      ELSE 0
    END::BIGINT,
    -- margin on Kitchyn-handled deliveries, only once delivered & cost known
    CASE
      WHEN o.dispatch_type = 'platform_rider'
           AND o.status = 'delivered' AND o.delivery_cost_kobo IS NOT NULL
        THEN COALESCE(o.delivery_fee_kobo,0) - o.delivery_cost_kobo
      ELSE 0
    END::BIGINT,
    -- total delivery margin
    CASE
      WHEN o.dispatch_type IN ('own_rider','third_party')
        THEN ROUND(COALESCE(o.delivery_fee_kobo,0)
             * COALESCE(r.delivery_commission_pct, v_dc_pct, 0.10))
      WHEN o.dispatch_type = 'platform_rider'
           AND o.status = 'delivered' AND o.delivery_cost_kobo IS NOT NULL
        THEN COALESCE(o.delivery_fee_kobo,0) - o.delivery_cost_kobo
      ELSE 0
    END::BIGINT,
    (o.dispatch_type = 'platform_rider'
      AND NOT (o.status = 'delivered' AND o.delivery_cost_kobo IS NOT NULL)),
    -- foodo_net = service_fee + merchant_charge + delivery_margin − gateway_fee
    (
      COALESCE(o.service_fee_kobo,0)
      + ROUND(COALESCE(o.total_kobo,
          COALESCE(o.subtotal_kobo,0) + COALESCE(o.vat_kobo,0)
          + COALESCE(o.delivery_fee_kobo,0) + COALESCE(o.service_fee_kobo,0)) * v_mc_pct)
      + CASE
          WHEN o.dispatch_type IN ('own_rider','third_party')
            THEN ROUND(COALESCE(o.delivery_fee_kobo,0)
                 * COALESCE(r.delivery_commission_pct, v_dc_pct, 0.10))
          WHEN o.dispatch_type = 'platform_rider'
               AND o.status = 'delivered' AND o.delivery_cost_kobo IS NOT NULL
            THEN COALESCE(o.delivery_fee_kobo,0) - o.delivery_cost_kobo
          ELSE 0
        END
      - LEAST(
          ROUND(COALESCE(o.total_kobo,
            COALESCE(o.subtotal_kobo,0) + COALESCE(o.vat_kobo,0)
            + COALESCE(o.delivery_fee_kobo,0) + COALESCE(o.service_fee_kobo,0)) * 0.015)
          + CASE WHEN COALESCE(o.total_kobo,
            COALESCE(o.subtotal_kobo,0) + COALESCE(o.vat_kobo,0)
            + COALESCE(o.delivery_fee_kobo,0) + COALESCE(o.service_fee_kobo,0)) >= 250000
                 THEN 10000 ELSE 0 END,
          200000)
    )::BIGINT
  FROM orders o
  JOIN restaurants r ON r.id = o.restaurant_id
  WHERE o.created_at >= p_from
    AND o.created_at <  p_to
    AND o.status NOT IN ('cancelled','pending')
    AND r.paystack_recipient_code IS NOT NULL;
END;
$$;

-- ── Platform summary (single row) ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION finance_summary(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS TABLE (
  order_count             BIGINT,
  gmv_kobo                BIGINT,
  avg_order_value_kobo    BIGINT,
  service_fees_kobo       BIGINT,
  merchant_charge_kobo    BIGINT,
  delivery_margin_kobo    BIGINT,
  own_commission_kobo     BIGINT,
  platform_delivery_margin_kobo BIGINT,
  delivery_fees_realised_kobo BIGINT,
  rider_costs_kobo        BIGINT,
  pending_platform_deliveries BIGINT,
  gateway_fees_kobo       BIGINT,
  net_revenue_kobo        BIGINT,  -- service + merchant charge + delivery margin
  foodo_net_kobo          BIGINT,  -- net_revenue − gateway fees (contribution)
  take_rate               NUMERIC, -- net_revenue / gmv
  vat_collected_kobo      BIGINT,  -- passthrough, remitted by merchants
  discounts_kobo          BIGINT,  -- merchant-funded promo value
  refund_count            BIGINT,
  refunds_kobo            BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM finance_assert_admin();
  RETURN QUERY
  WITH e AS (SELECT * FROM finance_order_economics(p_from, p_to)),
  rf AS (
    SELECT COUNT(*)::BIGINT AS cnt,
           COALESCE(SUM(COALESCE(o.total_kobo,
             COALESCE(o.subtotal_kobo,0) + COALESCE(o.vat_kobo,0)
             + COALESCE(o.delivery_fee_kobo,0) + COALESCE(o.service_fee_kobo,0))),0)::BIGINT AS total
      FROM orders o
      JOIN restaurants r ON r.id = o.restaurant_id
     WHERE o.created_at >= p_from AND o.created_at < p_to
       AND o.payment_status = 'refunded'
       AND r.paystack_recipient_code IS NOT NULL
  )
  SELECT
    COUNT(*)::BIGINT,
    COALESCE(SUM(e.order_total_kobo),0)::BIGINT,
    COALESCE(ROUND(AVG(e.order_total_kobo)),0)::BIGINT,
    COALESCE(SUM(e.service_fee_kobo),0)::BIGINT,
    COALESCE(SUM(e.merchant_charge_kobo),0)::BIGINT,
    COALESCE(SUM(e.delivery_margin_kobo),0)::BIGINT,
    COALESCE(SUM(e.own_commission_kobo),0)::BIGINT,
    COALESCE(SUM(e.platform_delivery_margin_kobo),0)::BIGINT,
    COALESCE(SUM(CASE WHEN e.dispatch_type = 'platform_rider'
                       AND NOT e.platform_delivery_pending
                      THEN e.delivery_fee_kobo ELSE 0 END),0)::BIGINT,
    COALESCE(SUM(CASE WHEN e.dispatch_type = 'platform_rider'
                       AND NOT e.platform_delivery_pending
                      THEN e.delivery_cost_kobo ELSE 0 END),0)::BIGINT,
    COUNT(*) FILTER (WHERE e.platform_delivery_pending)::BIGINT,
    COALESCE(SUM(e.gateway_fee_kobo),0)::BIGINT,
    (COALESCE(SUM(e.service_fee_kobo),0)
      + COALESCE(SUM(e.merchant_charge_kobo),0)
      + COALESCE(SUM(e.delivery_margin_kobo),0))::BIGINT,
    COALESCE(SUM(e.foodo_net_kobo),0)::BIGINT,
    CASE WHEN COALESCE(SUM(e.order_total_kobo),0) > 0
         THEN ROUND(
           (COALESCE(SUM(e.service_fee_kobo),0)
             + COALESCE(SUM(e.merchant_charge_kobo),0)
             + COALESCE(SUM(e.delivery_margin_kobo),0))::NUMERIC
           / SUM(e.order_total_kobo), 4)
         ELSE 0 END,
    COALESCE(SUM(e.vat_kobo),0)::BIGINT,
    COALESCE(SUM(e.discount_kobo),0)::BIGINT,
    rf.cnt,
    rf.total
  FROM e, rf;
END;
$$;

-- ── Daily series (for trend charts) ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION finance_daily(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS TABLE (
  day                     DATE,
  order_count             BIGINT,
  gmv_kobo                BIGINT,
  service_fees_kobo       BIGINT,
  merchant_charge_kobo    BIGINT,
  delivery_margin_kobo    BIGINT,
  gateway_fees_kobo       BIGINT,
  net_revenue_kobo        BIGINT,
  foodo_net_kobo          BIGINT,
  pending_platform_deliveries BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM finance_assert_admin();
  RETURN QUERY
  SELECT
    e.wat_date,
    COUNT(*)::BIGINT,
    SUM(e.order_total_kobo)::BIGINT,
    SUM(e.service_fee_kobo)::BIGINT,
    SUM(e.merchant_charge_kobo)::BIGINT,
    SUM(e.delivery_margin_kobo)::BIGINT,
    SUM(e.gateway_fee_kobo)::BIGINT,
    (SUM(e.service_fee_kobo) + SUM(e.merchant_charge_kobo)
      + SUM(e.delivery_margin_kobo))::BIGINT,
    SUM(e.foodo_net_kobo)::BIGINT,
    COUNT(*) FILTER (WHERE e.platform_delivery_pending)::BIGINT
  FROM finance_order_economics(p_from, p_to) e
  GROUP BY e.wat_date
  ORDER BY e.wat_date;
END;
$$;

-- ── Per-merchant ranking ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION finance_per_merchant(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS TABLE (
  restaurant_id           UUID,
  restaurant_name         TEXT,
  order_count             BIGINT,
  gmv_kobo                BIGINT,
  service_fees_kobo       BIGINT,
  merchant_charge_kobo    BIGINT,
  delivery_margin_kobo    BIGINT,
  gateway_fees_kobo       BIGINT,
  net_revenue_kobo        BIGINT,
  foodo_net_kobo          BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM finance_assert_admin();
  RETURN QUERY
  SELECT
    e.restaurant_id,
    e.restaurant_name,
    COUNT(*)::BIGINT,
    SUM(e.order_total_kobo)::BIGINT,
    SUM(e.service_fee_kobo)::BIGINT,
    SUM(e.merchant_charge_kobo)::BIGINT,
    SUM(e.delivery_margin_kobo)::BIGINT,
    SUM(e.gateway_fee_kobo)::BIGINT,
    (SUM(e.service_fee_kobo) + SUM(e.merchant_charge_kobo)
      + SUM(e.delivery_margin_kobo))::BIGINT,
    SUM(e.foodo_net_kobo)::BIGINT
  FROM finance_order_economics(p_from, p_to) e
  GROUP BY e.restaurant_id, e.restaurant_name
  ORDER BY SUM(e.order_total_kobo) DESC;
END;
$$;

-- ── Permissions ─────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION finance_assert_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION finance_order_economics(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION finance_summary(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION finance_daily(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION finance_per_merchant(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION finance_order_economics(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION finance_summary(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION finance_daily(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION finance_per_merchant(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated, service_role;
