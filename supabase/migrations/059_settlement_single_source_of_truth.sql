-- ============================================================================
-- 059: Settlements — Single Source of Truth
-- ============================================================================
-- Problem this fixes:
--   Merchant "net payout" was computed by THREE different formulas:
--     1. the manual settlement route  → flat 10% delivery commission on ALL
--        orders (ignored dispatch_type) → OVERPAID merchants 90% of every
--        platform-rider delivery fee.
--     2. every admin/merchant UI       → dispatch-aware (platform_rider = 100%,
--        own/third_party = 10%).
--     3. the wallet cached counters    → drifted independently because the old
--        debit_wallet_for_settlement mutated total_withdrawn separately from the
--        settlements table (total_withdrawn > total_earned was possible).
--
-- This migration makes ONE canonical formula authoritative in the database, the
-- same one shared by the TypeScript helper @foodo/utils computeOrderNet:
--
--   gross           = subtotal + vat + delivery_fee
--   order_total     = COALESCE(total_kobo, gross + service_fee)   -- Paystack total
--   merchant_charge = round(order_total * merchant_charge_pct)    -- 1% to merchant
--   delivery_commission (delivery orders only):
--       platform_rider          -> 100% of delivery_fee   (Foodo paid the rider)
--       own_rider / third_party -> round(delivery_fee * delivery_commission_pct)  -- 10%
--       un-dispatched (null)    -> 0
--   net = gross - merchant_charge - delivery_commission
--
-- (The customer service fee — ₦200 + 1% of order_total — is 100% Foodo revenue,
--  is never part of `gross`, and is never deducted from the merchant.)
--
-- Policy: history is FROZEN. We do NOT rewrite the cash that already left the
-- bank (settlements.amount_kobo). We store the canonical figure alongside it in
-- canonical_net_kobo so the over/under-payment per settlement is documented and
-- queryable. New settlements are recorded with the canonical formula, so
-- amount_kobo == canonical_net_kobo going forward.
-- ============================================================================

-- ── 1. Document the canonical net on every settlement ───────────────────────
ALTER TABLE settlements
  ADD COLUMN IF NOT EXISTS canonical_net_kobo BIGINT;

COMMENT ON COLUMN settlements.canonical_net_kobo IS
  'Net payout per the canonical dispatch-aware formula (migration 059). For new '
  'settlements this equals amount_kobo. For legacy rows it may differ; '
  '(amount_kobo - canonical_net_kobo) is the documented over(+)/under(-) payment.';

-- ── 2. The canonical per-order net, in SQL — mirrors @foodo/utils exactly ────
-- IMMUTABLE + pure so it can be used in aggregates and (later) generated columns.
CREATE OR REPLACE FUNCTION foodo_order_net_kobo(
  p_subtotal     BIGINT,
  p_vat          BIGINT,
  p_delivery     BIGINT,
  p_service      BIGINT,
  p_total        BIGINT,
  p_dispatch     TEXT,
  p_mc_pct       NUMERIC,
  p_dc_pct       NUMERIC
) RETURNS BIGINT
LANGUAGE sql IMMUTABLE AS $$
  WITH v(order_total) AS (
    -- Amount the customer actually paid (post-discount); fall back to the
    -- component sum only when total_kobo isn't stored.
    SELECT COALESCE(
      p_total,
      COALESCE(p_subtotal,0) + COALESCE(p_vat,0) + COALESCE(p_delivery,0) + COALESCE(p_service,0)
    )
  )
  SELECT (
    -- gross = order_total - service_fee  (subtotal_net + VAT + delivery)
    (v.order_total - COALESCE(p_service,0))
    -- - merchant charge (1% of the gateway order total)
    - ROUND(v.order_total * p_mc_pct)
    -- - dispatch-aware delivery commission
    - CASE
        WHEN COALESCE(p_delivery,0) <= 0 THEN 0
        WHEN p_dispatch = 'platform_rider' THEN p_delivery
        WHEN p_dispatch IN ('own_rider','third_party') THEN ROUND(p_delivery * p_dc_pct)
        ELSE 0
      END
  )::BIGINT
  FROM v
$$;

COMMENT ON FUNCTION foodo_order_net_kobo IS
  'Canonical merchant net for one order, in kobo. MUST stay in lock-step with '
  '@foodo/utils computeOrderNet. The single source of truth for payout math.';

-- ── 3. Resolve an order''s effective dispatch type (matches resolveDispatchType)
--      orders.dispatch_type -> latest delivery_assignment -> restaurant default.
CREATE OR REPLACE FUNCTION foodo_resolved_dispatch_type(p_order_id UUID)
RETURNS TEXT
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    o.dispatch_type,
    (SELECT da.dispatch_type
       FROM delivery_assignments da
      WHERE da.order_id = o.id
      ORDER BY da.assigned_at DESC
      LIMIT 1),
    r.logistics_default
  )
  FROM orders o
  JOIN restaurants r ON r.id = o.restaurant_id
  WHERE o.id = p_order_id
$$;

-- ── 4. Authoritative wallet recompute — derive counters from source tables ───
-- pending   = canonical net of unsettled, billable orders
-- withdrawn = sum of PAID settlements (the cash that actually left)
-- earned    = pending + withdrawn  (so "earned >= withdrawn" can never be false)
-- available = 0 (manual payout model has no available stage)
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

  -- Make sure a wallet row exists, then set every counter from the truth.
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

CREATE OR REPLACE FUNCTION recompute_all_restaurant_wallets()
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT DISTINCT restaurant_id FROM restaurant_wallets LOOP
    PERFORM recompute_restaurant_wallet(r.restaurant_id);
  END LOOP;
  -- Catch restaurants that have orders/settlements but no wallet row yet.
  FOR r IN
    SELECT DISTINCT restaurant_id FROM orders
    WHERE restaurant_id NOT IN (SELECT restaurant_id FROM restaurant_wallets)
  LOOP
    PERFORM recompute_restaurant_wallet(r.restaurant_id);
  END LOOP;
END $$;

-- ── 5. Keep wallets true automatically whenever a settlement changes ─────────
CREATE OR REPLACE FUNCTION trg_settlement_recompute_wallet()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM recompute_restaurant_wallet(OLD.restaurant_id);
    RETURN OLD;
  END IF;
  PERFORM recompute_restaurant_wallet(NEW.restaurant_id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS settlement_recompute_wallet ON settlements;
CREATE TRIGGER settlement_recompute_wallet
  AFTER INSERT OR UPDATE OR DELETE ON settlements
  FOR EACH ROW
  EXECUTE FUNCTION trg_settlement_recompute_wallet();

-- NOTE: We deliberately do NOT add a trigger on orders.settlement_id. Orders are
-- only ever linked to a settlement by the manual record route, which calls
-- recompute_restaurant_wallet() itself right after the batch update; the admin
-- settlements page also runs recompute_all_restaurant_wallets() on load. (A
-- statement-level transition-table trigger is illegal here anyway — Postgres
-- forbids transition tables on AFTER UPDATE OF <column> triggers — and a
-- row-level trigger would fire on every hot-path order status update.)

-- ── 6. Backfill canonical_net_kobo for every existing settlement ─────────────
WITH s AS (
  SELECT COALESCE(merchant_charge_pct, 0.01) AS mc,
         COALESCE(delivery_commission_pct, 0.10) AS dc
    FROM platform_settings LIMIT 1
),
per_settlement AS (
  SELECT o.settlement_id AS sid,
         SUM(
           foodo_order_net_kobo(
             o.subtotal_kobo, o.vat_kobo, o.delivery_fee_kobo, o.service_fee_kobo, o.total_kobo,
             COALESCE(
               o.dispatch_type,
               (SELECT da.dispatch_type FROM delivery_assignments da
                 WHERE da.order_id = o.id ORDER BY da.assigned_at DESC LIMIT 1),
               r.logistics_default
             ),
             (SELECT mc FROM s), (SELECT dc FROM s)
           )
         ) AS net
    FROM orders o
    JOIN restaurants r ON r.id = o.restaurant_id
   WHERE o.settlement_id IS NOT NULL
     AND o.status NOT IN ('cancelled', 'pending')
   GROUP BY o.settlement_id
)
UPDATE settlements st
   SET canonical_net_kobo = ps.net
  FROM per_settlement ps
 WHERE ps.sid = st.id;

-- Settlements with no linked orders (legacy/automatic): canonical == what was paid.
UPDATE settlements
   SET canonical_net_kobo = amount_kobo
 WHERE canonical_net_kobo IS NULL;

-- ── 7. Reconcile every wallet to the source of truth ─────────────────────────
SELECT recompute_all_restaurant_wallets();

-- ── 8. Retire the automatic settlement path (we settle manually now) ─────────
-- Unschedule the cron that triggered the process-settlements edge function.
-- (The edge function itself is removed from the repo in this change.)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN PERFORM cron.unschedule('release-pending-wallet-balances'); EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
END $$;
