-- ============================================================
-- redeem_discount — atomic redemption counter
--
-- Called from the payment webhook AFTER an order is created. The
-- order has already been paid at the discounted price, so we always
-- honor it; this just advances the counter atomically so subsequent
-- checkouts see the up-to-date usage and limits hold under
-- concurrency (closes the init -> payment race window).
--
-- Returns the new times_redeemed value.
-- ============================================================
CREATE OR REPLACE FUNCTION public.redeem_discount(p_discount_id UUID)
  RETURNS INTEGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_new_count INTEGER;
BEGIN
  UPDATE public.discounts
     SET times_redeemed = times_redeemed + 1
   WHERE id = p_discount_id
  RETURNING times_redeemed INTO v_new_count;

  RETURN v_new_count;
END;
$$;
