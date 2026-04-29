-- ============================================================
-- 037: Customer address history
-- Allows returning customers to quickly re-select past delivery
-- addresses per restaurant.
-- ============================================================

CREATE TABLE IF NOT EXISTS customer_addresses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  address       TEXT NOT NULL,
  label         TEXT, -- e.g. "Home", "Work"
  is_default    BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookup of a customer's addresses at a restaurant
CREATE INDEX IF NOT EXISTS idx_customer_addresses_lookup
  ON customer_addresses (customer_id, restaurant_id);

-- Prevent duplicate exact addresses per customer
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_addresses_unique
  ON customer_addresses (customer_id, address);

-- Ensure only one default per customer per restaurant
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_addresses_one_default
  ON customer_addresses (customer_id, restaurant_id)
  WHERE is_default = true;

-- RLS: customers can read their own addresses via user_id join
ALTER TABLE customer_addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customer_addresses_restaurant_isolation"
  ON customer_addresses FOR ALL
  USING (
    restaurant_id = (SELECT restaurant_id FROM user_profiles WHERE id = auth.uid())
  );
