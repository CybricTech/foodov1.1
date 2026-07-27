-- ============================================================================
-- 100: Fix finance_order_economics() BIGINT type mismatch
-- ============================================================================
-- orders.delivery_cost_kobo is INTEGER, but the function's RETURNS TABLE
-- declares delivery_cost_kobo as BIGINT. RETURN QUERY requires an EXACT
-- column-type match (no implicit widening the way a plain SELECT would give
-- you), so every call errored:
--   "structure of query does not match function result type
--    DETAIL: Returned type integer does not match expected type bigint in
--    column 16."
-- This broke finance_order_economics itself (called directly by the Unit
-- Economics page) and everything built on top of it — finance_summary,
-- finance_daily, finance_per_merchant. Fix: explicit ::BIGINT cast, matching
-- every other numeric column in this function.
-- ============================================================================

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
    o.delivery_cost_kobo::BIGINT,
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

REVOKE ALL ON FUNCTION finance_order_economics(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION finance_order_economics(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated, service_role;
