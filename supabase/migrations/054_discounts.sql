-- ============================================================
-- Marketing & Discounts
--
-- Merchant-funded discounts that customers redeem at checkout,
-- either via a promo code or automatically inside a time window.
--
-- Money model: the discount reduces the customer's total AND the
-- merchant's wallet credit at settlement (merchant-funded).
--
-- Validation is ALWAYS server-side (service role in the checkout
-- flow). Codes are never exposed to anon clients — there is no
-- public RLS read policy on this table.
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- 1. discounts — the rule
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS discounts (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id             UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,

  name                      TEXT NOT NULL,              -- internal label, e.g. "Weekend 20%"
  description               TEXT,                       -- optional customer-facing text

  -- Trigger: how the customer gets it
  trigger                   TEXT NOT NULL
                              CHECK (trigger IN ('code', 'automatic')),
  code                      TEXT,                       -- NULL for automatic; uppercased

  -- Type: what the discount does
  type                      TEXT NOT NULL
                              CHECK (type IN ('percentage', 'fixed', 'free_delivery')),
  -- value semantics:
  --   percentage -> whole percent (e.g. 20 = 20%)
  --   fixed      -> kobo off the subtotal
  --   free_delivery -> NULL (waiver computed from the order's delivery fee)
  value                     BIGINT,
  max_discount_kobo         BIGINT,                     -- optional cap for percentage

  -- Eligibility
  min_order_kobo            BIGINT NOT NULL DEFAULT 0,  -- subtotal threshold
  fulfillment_type          TEXT
                              CHECK (fulfillment_type IN ('delivery', 'pickup')),
                              -- NULL = applies to both

  -- Time window (NULL = open-ended on that side)
  starts_at                 TIMESTAMPTZ,
  ends_at                   TIMESTAMPTZ,

  -- Usage limits
  usage_limit_total         INTEGER,                    -- NULL = unlimited
  usage_limit_per_customer  INTEGER,                    -- NULL = unlimited (keyed by phone)
  times_redeemed            INTEGER NOT NULL DEFAULT 0,

  is_active                 BOOLEAN NOT NULL DEFAULT true,

  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Type-specific value sanity
  CONSTRAINT discounts_percentage_value
    CHECK (type <> 'percentage' OR (value IS NOT NULL AND value > 0 AND value <= 100)),
  CONSTRAINT discounts_fixed_value
    CHECK (type <> 'fixed' OR (value IS NOT NULL AND value > 0)),
  -- A coded discount must carry a code; an automatic one must not
  CONSTRAINT discounts_code_presence
    CHECK ((trigger = 'code') = (code IS NOT NULL))
);

-- One active code namespace per restaurant (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS discounts_restaurant_code_unique
  ON discounts (restaurant_id, upper(code))
  WHERE code IS NOT NULL;

CREATE INDEX IF NOT EXISTS discounts_restaurant_active_idx
  ON discounts (restaurant_id, is_active);

ALTER TABLE discounts ENABLE ROW LEVEL SECURITY;

-- Merchants manage their own restaurant's discounts. Checkout uses the
-- service role (bypasses RLS), so no anon policy is needed — codes stay secret.
CREATE POLICY "discounts_restaurant_isolation"
  ON discounts FOR ALL
  USING (restaurant_id = public.get_my_restaurant_id())
  WITH CHECK (restaurant_id = public.get_my_restaurant_id());

CREATE POLICY "discounts_admin_all"
  ON discounts FOR ALL
  USING (public.get_my_role() = 'super_admin');

-- ──────────────────────────────────────────────────────────
-- 2. discount_redemptions — one row per use
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS discount_redemptions (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id             UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  discount_id               UUID NOT NULL REFERENCES discounts(id) ON DELETE CASCADE,
  order_id                  UUID REFERENCES orders(id) ON DELETE SET NULL,
  customer_id               UUID REFERENCES customers(id) ON DELETE SET NULL,
  customer_phone            TEXT NOT NULL,              -- redemption key for per-customer limits
  amount_kobo               BIGINT NOT NULL,           -- actual discount applied
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS discount_redemptions_discount_phone_idx
  ON discount_redemptions (discount_id, customer_phone);

CREATE INDEX IF NOT EXISTS discount_redemptions_restaurant_idx
  ON discount_redemptions (restaurant_id);

ALTER TABLE discount_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "discount_redemptions_restaurant_isolation"
  ON discount_redemptions FOR ALL
  USING (restaurant_id = public.get_my_restaurant_id())
  WITH CHECK (restaurant_id = public.get_my_restaurant_id());

CREATE POLICY "discount_redemptions_admin_all"
  ON discount_redemptions FOR ALL
  USING (public.get_my_role() = 'super_admin');

-- ──────────────────────────────────────────────────────────
-- 3. orders — record which discount was applied
-- ──────────────────────────────────────────────────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS discount_id    UUID REFERENCES discounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS discount_code  TEXT,
  ADD COLUMN IF NOT EXISTS discount_kobo  BIGINT NOT NULL DEFAULT 0;

-- ──────────────────────────────────────────────────────────
-- 4. updated_at trigger (reuse if a shared one exists)
-- ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS discounts_set_updated_at ON discounts;
CREATE TRIGGER discounts_set_updated_at
  BEFORE UPDATE ON discounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ──────────────────────────────────────────────────────────
-- 5. Realtime — merchant Marketing list updates live
-- ──────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'discounts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE discounts;
  END IF;
END $$;
