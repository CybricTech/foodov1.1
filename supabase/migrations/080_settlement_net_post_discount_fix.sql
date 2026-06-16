-- ─────────────────────────────────────────────────────────────────────────────
-- 080 · Fix foodo_order_net_kobo() to settle off the POST-discount total
-- ─────────────────────────────────────────────────────────────────────────────
-- The canonical net-payout formula lives in ONE place: @foodo/utils
-- computeOrderNet() (packages/utils/src/settlements.ts). The SQL mirror
-- foodo_order_net_kobo() MUST match it exactly — it is never allowed to diverge.
--
-- BUG: the deployed function computed gross from the PRE-discount components:
--        gross = subtotal_kobo + vat_kobo + delivery_fee_kobo
--      while the merchant-charge term already (correctly) used the post-discount
--      total_kobo. Net therefore overstated the payout by exactly the discount,
--      so restaurant_wallets.pending_balance_kobo (set by recompute_restaurant_
--      wallet → this function) — i.e. the merchant "Expected Payout" headline —
--      was inflated by the discount, while every TS surface (admin settlements,
--      the merchant breakdown lines) showed the correct, lower figure.
--
--      Verified on DRIZZY'S live: 9 unsettled orders, ₦3,120 discount →
--      buggy ₦114,616.73 vs canonical ₦111,496.73 (delta = the discount).
--
-- FIX: gross = order_total − service_fee, where order_total = total_kobo (what
--      the customer actually paid, post-discount), falling back to the component
--      sum only for legacy rows that never stored total_kobo. This is line-for-
--      line the @foodo/utils computeOrderNet definition. No regression for
--      discount-free or legacy orders (total = subtotal+vat+delivery+service ⇒
--      gross = subtotal+vat+delivery, identical to before).

CREATE OR REPLACE FUNCTION public.foodo_order_net_kobo(
  p_subtotal bigint,
  p_vat bigint,
  p_delivery bigint,
  p_service bigint,
  p_total bigint,
  p_dispatch text,
  p_mc_pct numeric,
  p_dc_pct numeric
)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT (
    -- order_total = the amount the customer actually paid (post-discount).
    -- Fall back to the component sum only when total_kobo isn't stored.
    -- gross = order_total − service_fee   (service fee is 100% Foodo's, never the merchant's)
    (
      COALESCE(
        p_total,
        COALESCE(p_subtotal,0) + COALESCE(p_vat,0) + COALESCE(p_delivery,0) + COALESCE(p_service,0)
      )
      - COALESCE(p_service,0)
    )
    -- − merchant charge: 1% of the order total
    - ROUND(
        COALESCE(
          p_total,
          COALESCE(p_subtotal,0) + COALESCE(p_vat,0) + COALESCE(p_delivery,0) + COALESCE(p_service,0)
        ) * p_mc_pct
      )
    -- − dispatch-aware delivery commission
    - CASE
        WHEN COALESCE(p_delivery,0) <= 0 THEN 0
        WHEN p_dispatch = 'platform_rider' THEN p_delivery
        WHEN p_dispatch IN ('own_rider','third_party') THEN ROUND(p_delivery * p_dc_pct)
        ELSE 0
      END
  )::BIGINT
$function$;

-- Re-derive every existing wallet's pending balance off the corrected formula so
-- the "Expected Payout" headline immediately matches the canonical figure.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT restaurant_id FROM restaurant_wallets LOOP
    PERFORM public.recompute_restaurant_wallet(r.restaurant_id);
  END LOOP;
END $$;
