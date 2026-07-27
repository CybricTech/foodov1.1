-- ============================================================================
-- 099: Fix finance_summary() GROUP BY error
-- ============================================================================
-- finance_summary joined the single-row `rf` (refunds) CTE against `e` via
-- `FROM e, rf`, then selected rf.cnt/rf.total alongside aggregates over e
-- (COUNT(*), SUM(...)) without a GROUP BY. Postgres can't statically know rf
-- has exactly one row, so it rejected the query outright:
--   "column \"rf.cnt\" must appear in the GROUP BY clause or be used in an
--    aggregate function"
-- This made finance_summary() error on every call — the Finance Overview
-- page showed "No finance data for this range" for ALL periods, not just
-- days with zero orders. Fix: pull the refund totals via scalar subqueries
-- instead of a cross join, so there's nothing left ungrouped.
-- ============================================================================

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
  net_revenue_kobo        BIGINT,
  foodo_net_kobo          BIGINT,
  take_rate               NUMERIC,
  vat_collected_kobo      BIGINT,
  discounts_kobo          BIGINT,
  refund_count            BIGINT,
  refunds_kobo            BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM finance_assert_admin();
  RETURN QUERY
  WITH e AS (SELECT * FROM finance_order_economics(p_from, p_to))
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
    (SELECT COUNT(*)::BIGINT
       FROM orders o JOIN restaurants r ON r.id = o.restaurant_id
      WHERE o.created_at >= p_from AND o.created_at < p_to
        AND o.payment_status = 'refunded'
        AND r.paystack_recipient_code IS NOT NULL),
    (SELECT COALESCE(SUM(COALESCE(o.total_kobo,
             COALESCE(o.subtotal_kobo,0) + COALESCE(o.vat_kobo,0)
             + COALESCE(o.delivery_fee_kobo,0) + COALESCE(o.service_fee_kobo,0))),0)::BIGINT
       FROM orders o JOIN restaurants r ON r.id = o.restaurant_id
      WHERE o.created_at >= p_from AND o.created_at < p_to
        AND o.payment_status = 'refunded'
        AND r.paystack_recipient_code IS NOT NULL)
  FROM e;
END;
$$;

REVOKE ALL ON FUNCTION finance_summary(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION finance_summary(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated, service_role;
