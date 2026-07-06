-- ============================================================================
-- 089: Per-merchant in-house delivery commission
-- ============================================================================
-- Canonically the platform takes 10% of the delivery fee on rides the merchant
-- handles themselves (own_rider / third_party) — the global rate lives on
-- platform_settings.delivery_commission_pct. Some merchants negotiate a
-- different rate, so this migration adds a per-merchant override:
--
--   restaurants.delivery_commission_pct  NUMERIC(5,4)  NULL
--     NULL  -> inherit the platform default (canonical 10%)
--     0.15  -> this merchant pays 15% on own/third-party delivery fees
--
-- Effective-rate resolution — the SINGLE rule, mirrored by the TypeScript
-- helper @foodo/utils resolveDeliveryCommissionPct:
--
--   COALESCE(restaurants.delivery_commission_pct,
--            platform_settings.delivery_commission_pct, 0.10)
--
-- Money semantics (consistent with migration 059's recompute-from-source
-- model): the effective rate applies to every UNSETTLED order of that merchant
-- the moment it changes — exactly how a change to the global rate already
-- behaves. Settled history is frozen in the settlements rows (amount_kobo /
-- canonical_net_kobo) and is never rewritten.
--
-- platform_rider commission is untouched: the platform always keeps 100% of
-- the delivery fee when it provided and paid the rider.
-- ============================================================================

-- ── 1. The override column ───────────────────────────────────────────────────
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS delivery_commission_pct NUMERIC(5,4)
    CONSTRAINT restaurants_delivery_commission_pct_range
    CHECK (delivery_commission_pct IS NULL
           OR (delivery_commission_pct >= 0 AND delivery_commission_pct <= 1));

COMMENT ON COLUMN restaurants.delivery_commission_pct IS
  'Per-merchant override of the in-house (own_rider/third_party) delivery '
  'commission, as a fraction (0.10 = 10%). NULL = inherit '
  'platform_settings.delivery_commission_pct. Resolved via COALESCE(merchant, '
  'platform, 0.10) — keep in lock-step with @foodo/utils '
  'resolveDeliveryCommissionPct.';

-- ── 2. Wallet recompute resolves the rate per merchant ───────────────────────
-- Same body as migration 059 except v_dc now honours the merchant override.
CREATE OR REPLACE FUNCTION recompute_restaurant_wallet(p_restaurant_id UUID)
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_mc        NUMERIC;
  v_dc        NUMERIC;
  v_pending   BIGINT;
  v_withdrawn BIGINT;
BEGIN
  SELECT COALESCE(merchant_charge_pct, 0.01),
         COALESCE(delivery_commission_pct, 0.10)
    INTO v_mc, v_dc
    FROM platform_settings
   LIMIT 1;

  v_mc := COALESCE(v_mc, 0.01);
  v_dc := COALESCE(v_dc, 0.10);

  -- Merchant override beats the platform default (NULL = inherit).
  SELECT COALESCE(r.delivery_commission_pct, v_dc)
    INTO v_dc
    FROM restaurants r
   WHERE r.id = p_restaurant_id;

  v_dc := COALESCE(v_dc, 0.10);

  SELECT COALESCE(SUM(
           foodo_order_net_kobo(
             o.subtotal_kobo, o.vat_kobo, o.delivery_fee_kobo, o.service_fee_kobo, o.total_kobo,
             COALESCE(
               o.dispatch_type,
               (SELECT da.dispatch_type FROM delivery_assignments da
                 WHERE da.order_id = o.id ORDER BY da.assigned_at DESC LIMIT 1),
               r.logistics_default
             ),
             v_mc, v_dc
           )
         ), 0)
    INTO v_pending
    FROM orders o
    JOIN restaurants r ON r.id = o.restaurant_id
   WHERE o.restaurant_id = p_restaurant_id
     AND o.settlement_id IS NULL
     AND o.status NOT IN ('cancelled', 'pending');

  SELECT COALESCE(SUM(amount_kobo), 0)
    INTO v_withdrawn
    FROM settlements
   WHERE restaurant_id = p_restaurant_id
     AND status = 'paid';

  INSERT INTO restaurant_wallets (restaurant_id)
  VALUES (p_restaurant_id)
  ON CONFLICT (restaurant_id) DO NOTHING;

  UPDATE restaurant_wallets
     SET pending_balance_kobo   = v_pending,
         available_balance_kobo = 0,
         total_withdrawn_kobo   = v_withdrawn,
         total_earned_kobo      = v_pending + v_withdrawn,
         updated_at             = now()
   WHERE restaurant_id = p_restaurant_id;
END $$;

-- ── 3. Reconcile every wallet (no-op while all overrides are NULL) ───────────
SELECT recompute_all_restaurant_wallets();
