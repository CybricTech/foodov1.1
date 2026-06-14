-- ============================================================
-- 075: Loyalty & rewards — merchant-run stamp cards.
--
-- A merchant configures ONE stamp-card program for their restaurant
-- ("collect N stamps → reward"). Customers (keyed by phone, like the
-- CRM + discounts) earn a stamp on each qualifying PAID order; the
-- stamp is reversed if that order is cancelled. The reward reuses the
-- discount engine's reward shapes (free delivery / % off / fixed / item)
-- so redemption flows through the existing money/settlement plumbing.
--
-- This migration is the FOUNDATION (program + accrual ledger + trigger).
-- Redemption at checkout and the customer-facing progress UI build on it
-- in a follow-up. Auto-enroll: any phone that orders accrues stamps.
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- 1. loyalty_programs — the rule (one per restaurant)
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loyalty_programs (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id             UUID NOT NULL UNIQUE REFERENCES restaurants(id) ON DELETE CASCADE,

  is_active                 BOOLEAN NOT NULL DEFAULT false,

  -- How many stamps unlock the reward.
  stamps_required           INTEGER NOT NULL DEFAULT 10
                              CHECK (stamps_required BETWEEN 2 AND 100),
  -- Minimum order subtotal (kobo) to earn a stamp. 0 = any paid order.
  earn_min_order_kobo       BIGINT NOT NULL DEFAULT 0 CHECK (earn_min_order_kobo >= 0),

  -- The reward, mirroring the discounts engine's shapes.
  reward_type               TEXT NOT NULL DEFAULT 'free_delivery'
                              CHECK (reward_type IN ('percentage', 'fixed', 'free_delivery', 'free_item')),
  --   percentage    -> reward_value = whole percent (1..100), optional cap
  --   fixed         -> reward_value = kobo off the subtotal
  --   free_delivery -> reward_value NULL (waiver of the order's delivery fee)
  --   free_item     -> reward_value NULL; reward_label names the item
  reward_value              BIGINT,
  reward_max_discount_kobo  BIGINT,                    -- optional cap for percentage
  reward_label              TEXT,                       -- customer-facing, e.g. "Free meal"

  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT loyalty_reward_percentage
    CHECK (reward_type <> 'percentage' OR (reward_value IS NOT NULL AND reward_value > 0 AND reward_value <= 100)),
  CONSTRAINT loyalty_reward_fixed
    CHECK (reward_type <> 'fixed' OR (reward_value IS NOT NULL AND reward_value > 0))
);

ALTER TABLE loyalty_programs ENABLE ROW LEVEL SECURITY;

-- Merchants manage their own program; reads happen server-side for the
-- storefront (service role), mirroring how discounts are never exposed to anon.
DROP POLICY IF EXISTS "loyalty_programs_merchant" ON loyalty_programs;
CREATE POLICY "loyalty_programs_merchant"
  ON loyalty_programs FOR ALL
  USING (restaurant_id = (SELECT restaurant_id FROM user_profiles WHERE id = auth.uid()))
  WITH CHECK (restaurant_id = (SELECT restaurant_id FROM user_profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "loyalty_programs_admin" ON loyalty_programs;
CREATE POLICY "loyalty_programs_admin"
  ON loyalty_programs FOR ALL
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'super_admin'));

-- ──────────────────────────────────────────────────────────
-- 2. loyalty_stamps — append-only ledger; balance = SUM(delta)
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loyalty_stamps (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id                UUID NOT NULL REFERENCES loyalty_programs(id) ON DELETE CASCADE,
  restaurant_id             UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  customer_phone            TEXT NOT NULL,
  order_id                  UUID REFERENCES orders(id) ON DELETE SET NULL,

  delta                     INTEGER NOT NULL,           -- +1 earn, -stamps_required redeem, -1 reverse
  reason                    TEXT NOT NULL
                              CHECK (reason IN ('earn', 'redeem', 'reverse', 'adjust')),

  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One earn / one reverse / one redeem per order — makes accrual idempotent
  -- across every order-creation path (webhook, status fallback, retries).
  CONSTRAINT loyalty_stamps_once_per_order UNIQUE (program_id, order_id, reason)
);

CREATE INDEX IF NOT EXISTS idx_loyalty_stamps_balance
  ON loyalty_stamps (program_id, customer_phone);

ALTER TABLE loyalty_stamps ENABLE ROW LEVEL SECURITY;

-- Merchants read their own ledger (CRM / enrolled-customer views). Writes come
-- from the accrual trigger / checkout flow, which run as the service role.
DROP POLICY IF EXISTS "loyalty_stamps_merchant_read" ON loyalty_stamps;
CREATE POLICY "loyalty_stamps_merchant_read"
  ON loyalty_stamps FOR SELECT
  USING (restaurant_id = (SELECT restaurant_id FROM user_profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "loyalty_stamps_admin" ON loyalty_stamps;
CREATE POLICY "loyalty_stamps_admin"
  ON loyalty_stamps FOR ALL
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'super_admin'));

-- ──────────────────────────────────────────────────────────
-- 3. Balance helper
-- ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION loyalty_balance(p_program_id UUID, p_phone TEXT)
RETURNS INTEGER
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(SUM(delta), 0)::int
  FROM loyalty_stamps
  WHERE program_id = p_program_id AND customer_phone = p_phone;
$$;

-- ──────────────────────────────────────────────────────────
-- 4. Accrual trigger — earn on paid, reverse on cancel.
--    Idempotent via loyalty_stamps_once_per_order. All order writes flow
--    through the service role (webhooks, status route, dashboard routes),
--    so these inserts bypass RLS as intended.
-- ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION loyalty_award_on_order()
RETURNS TRIGGER AS $$
DECLARE
  prog loyalty_programs%ROWTYPE;
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

  -- Earn one stamp once the order is paid and not cancelled.
  IF NEW.payment_status = 'paid'
     AND NEW.status <> 'cancelled'
     AND COALESCE(NEW.subtotal_kobo, 0) >= prog.earn_min_order_kobo THEN
    INSERT INTO loyalty_stamps (program_id, restaurant_id, customer_phone, order_id, delta, reason)
    VALUES (prog.id, NEW.restaurant_id, NEW.customer_phone, NEW.id, 1, 'earn')
    ON CONFLICT ON CONSTRAINT loyalty_stamps_once_per_order DO NOTHING;
  END IF;

  -- Reverse the earned stamp if the order is cancelled (only if one was earned).
  IF NEW.status = 'cancelled' THEN
    INSERT INTO loyalty_stamps (program_id, restaurant_id, customer_phone, order_id, delta, reason)
    SELECT prog.id, NEW.restaurant_id, NEW.customer_phone, NEW.id, -1, 'reverse'
    WHERE EXISTS (
      SELECT 1 FROM loyalty_stamps
      WHERE program_id = prog.id AND order_id = NEW.id AND reason = 'earn'
    )
    ON CONFLICT ON CONSTRAINT loyalty_stamps_once_per_order DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_loyalty_award ON orders;
CREATE TRIGGER trg_loyalty_award
  AFTER INSERT OR UPDATE OF status, payment_status ON orders
  FOR EACH ROW EXECUTE FUNCTION loyalty_award_on_order();

-- ──────────────────────────────────────────────────────────
-- 5. updated_at touch
-- ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_loyalty_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_loyalty_programs_updated_at ON loyalty_programs;
CREATE TRIGGER trg_loyalty_programs_updated_at
  BEFORE UPDATE ON loyalty_programs
  FOR EACH ROW EXECUTE FUNCTION set_loyalty_updated_at();
