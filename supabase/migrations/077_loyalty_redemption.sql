-- ============================================================
-- 077: Loyalty redemption — spend stamps for a reward at checkout.
--
-- When a customer is eligible, the checkout auto-applies the reward (as a
-- discount) and stamps the resulting order with how many stamps it spent.
-- These columns let the accrual trigger record the SPEND in the same ledger
-- the earns live in — and reverse everything cleanly if the order is later
-- cancelled.
--
-- orders is published to Realtime with an explicit column list, so adding
-- columns here does not change what Realtime decodes.
-- ============================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS loyalty_redeemed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS loyalty_stamps_spent INTEGER;

-- Extend the accrual trigger: still earn +1 on a qualifying paid order, now
-- also record the redeem spend, and on cancellation reverse the NET of every
-- non-reverse ledger row for the order (earn and/or redeem) in one entry.
CREATE OR REPLACE FUNCTION loyalty_award_on_order()
RETURNS TRIGGER AS $$
DECLARE
  prog loyalty_programs%ROWTYPE;
  v_reverse INTEGER;
BEGIN
  IF NEW.customer_phone IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO prog
  FROM loyalty_programs
  WHERE restaurant_id = NEW.restaurant_id AND is_active;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF NEW.status <> 'cancelled' AND NEW.payment_status = 'paid' THEN
    -- Earn one stamp on a qualifying order.
    IF COALESCE(NEW.subtotal_kobo, 0) >= prog.earn_min_order_kobo THEN
      INSERT INTO loyalty_stamps (program_id, restaurant_id, customer_phone, order_id, delta, reason)
      VALUES (prog.id, NEW.restaurant_id, NEW.customer_phone, NEW.id, 1, 'earn')
      ON CONFLICT ON CONSTRAINT loyalty_stamps_once_per_order DO NOTHING;
    END IF;

    -- Spend stamps when this order redeemed the reward.
    IF NEW.loyalty_redeemed AND COALESCE(NEW.loyalty_stamps_spent, 0) > 0 THEN
      INSERT INTO loyalty_stamps (program_id, restaurant_id, customer_phone, order_id, delta, reason)
      VALUES (prog.id, NEW.restaurant_id, NEW.customer_phone, NEW.id, -NEW.loyalty_stamps_spent, 'redeem')
      ON CONFLICT ON CONSTRAINT loyalty_stamps_once_per_order DO NOTHING;
    END IF;
  END IF;

  -- Reverse everything for the order if it is cancelled (one netting entry).
  IF NEW.status = 'cancelled' THEN
    SELECT COALESCE(SUM(delta), 0) INTO v_reverse
    FROM loyalty_stamps
    WHERE program_id = prog.id AND order_id = NEW.id AND reason <> 'reverse';

    IF v_reverse <> 0 THEN
      INSERT INTO loyalty_stamps (program_id, restaurant_id, customer_phone, order_id, delta, reason)
      VALUES (prog.id, NEW.restaurant_id, NEW.customer_phone, NEW.id, -v_reverse, 'reverse')
      ON CONFLICT ON CONSTRAINT loyalty_stamps_once_per_order DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger so it also fires when loyalty_redeemed is set at creation.
DROP TRIGGER IF EXISTS trg_loyalty_award ON orders;
CREATE TRIGGER trg_loyalty_award
  AFTER INSERT OR UPDATE OF status, payment_status, loyalty_redeemed ON orders
  FOR EACH ROW EXECUTE FUNCTION loyalty_award_on_order();
