-- ============================================================
-- 079: Robust loyalty — item-specific earning + free-item rewards.
--
-- Two upgrades to the stamp-card model:
--
--  1. EARN SCOPE. A program can earn a stamp on ANY paid order (default), OR
--     only on specific items — e.g. a cafe's "buy 5 coffees, get one free".
--     For item scope, a paid order earns one stamp PER QUALIFYING ITEM UNIT
--     (3 coffees in one order = 3 stamps).
--
--  2. FREE-ITEM REWARD. A 'free_item' reward names the eligible menu item(s);
--     checkout frees one that's in the cart (the cheapest) or prompts the
--     customer to add it — no more "ask the restaurant".
--
-- Because item-scoped earning needs the order's line items (inserted AFTER the
-- order row), accrual moves out of the insert trigger into an explicit RPC the
-- order-creation paths call once items exist. The trigger now only reverses a
-- cancelled order's stamps (which needs no item data).
-- ============================================================

ALTER TABLE loyalty_programs
  ADD COLUMN IF NOT EXISTS reward_item_ids UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS earn_item_ids   UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS earn_scope      TEXT   NOT NULL DEFAULT 'order'
                            CHECK (earn_scope IN ('order', 'item'));

-- ──────────────────────────────────────────────────────────
-- Accrual RPC — earn + redeem for one order. Idempotent (one earn / one redeem
-- row per order, guarded by loyalty_stamps_once_per_order). Called by every
-- order-creation path AFTER order_items are inserted.
-- ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION loyalty_accrue_for_order(p_order_id UUID)
RETURNS VOID AS $$
DECLARE
  o     orders%ROWTYPE;
  prog  loyalty_programs%ROWTYPE;
  v_earn INTEGER;
BEGIN
  SELECT * INTO o FROM orders WHERE id = p_order_id;
  IF NOT FOUND OR o.customer_phone IS NULL THEN
    RETURN;
  END IF;
  IF o.status = 'cancelled' OR o.payment_status <> 'paid' THEN
    RETURN;
  END IF;

  SELECT * INTO prog
  FROM loyalty_programs
  WHERE restaurant_id = o.restaurant_id AND is_active;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Earn: one stamp per order, or one per qualifying item unit.
  IF prog.earn_scope = 'item' THEN
    SELECT COALESCE(SUM(oi.quantity), 0) INTO v_earn
    FROM order_items oi
    WHERE oi.order_id = p_order_id
      AND oi.menu_item_id = ANY (prog.earn_item_ids);
  ELSE
    v_earn := CASE WHEN COALESCE(o.subtotal_kobo, 0) >= prog.earn_min_order_kobo THEN 1 ELSE 0 END;
  END IF;

  IF v_earn > 0 THEN
    INSERT INTO loyalty_stamps (program_id, restaurant_id, customer_phone, order_id, delta, reason)
    VALUES (prog.id, o.restaurant_id, o.customer_phone, p_order_id, v_earn, 'earn')
    ON CONFLICT ON CONSTRAINT loyalty_stamps_once_per_order DO NOTHING;
  END IF;

  -- Redeem: spend stamps when this order claimed the reward.
  IF o.loyalty_redeemed AND COALESCE(o.loyalty_stamps_spent, 0) > 0 THEN
    INSERT INTO loyalty_stamps (program_id, restaurant_id, customer_phone, order_id, delta, reason)
    VALUES (prog.id, o.restaurant_id, o.customer_phone, p_order_id, -o.loyalty_stamps_spent, 'redeem')
    ON CONFLICT ON CONSTRAINT loyalty_stamps_once_per_order DO NOTHING;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ──────────────────────────────────────────────────────────
-- Trigger now ONLY reverses a cancelled order (earn/redeem moved to the RPC).
-- ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION loyalty_award_on_order()
RETURNS TRIGGER AS $$
DECLARE
  prog loyalty_programs%ROWTYPE;
  v_reverse INTEGER;
BEGIN
  IF NEW.status <> 'cancelled' OR NEW.customer_phone IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO prog
  FROM loyalty_programs
  WHERE restaurant_id = NEW.restaurant_id AND is_active;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(delta), 0) INTO v_reverse
  FROM loyalty_stamps
  WHERE program_id = prog.id AND order_id = NEW.id AND reason <> 'reverse';

  IF v_reverse <> 0 THEN
    INSERT INTO loyalty_stamps (program_id, restaurant_id, customer_phone, order_id, delta, reason)
    VALUES (prog.id, NEW.restaurant_id, NEW.customer_phone, NEW.id, -v_reverse, 'reverse')
    ON CONFLICT ON CONSTRAINT loyalty_stamps_once_per_order DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Fire only on cancellation now (no earn-on-insert).
DROP TRIGGER IF EXISTS trg_loyalty_award ON orders;
CREATE TRIGGER trg_loyalty_award
  AFTER UPDATE OF status ON orders
  FOR EACH ROW
  WHEN (NEW.status = 'cancelled')
  EXECUTE FUNCTION loyalty_award_on_order();
