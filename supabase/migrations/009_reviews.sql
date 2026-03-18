-- ============================================================
-- Foodo Platform — Reviews
-- Migration 009
--
-- Allows customers to leave a star rating + optional comment
-- for a restaurant after an order. Merchants can moderate
-- (approve / hide) reviews from their dashboard.
-- ============================================================

-- ============================================================
-- TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS reviews (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   UUID        NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  order_id        UUID        REFERENCES orders(id) ON DELETE SET NULL,    -- optional order link
  customer_id     UUID        REFERENCES customers(id) ON DELETE SET NULL, -- optional CRM link
  reviewer_name   TEXT        NOT NULL,
  reviewer_phone  TEXT,
  rating          SMALLINT    NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment         TEXT,
  is_approved     BOOLEAN     NOT NULL DEFAULT true,  -- auto-approve; merchants can hide
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One review per phone number per restaurant
  UNIQUE (restaurant_id, reviewer_phone)
);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- Anyone can read approved reviews (storefront display)
CREATE POLICY "reviews_public_read"
  ON reviews FOR SELECT
  USING (is_approved = true);

-- Anyone can submit a review (guest customers — constrained by the unique index)
CREATE POLICY "reviews_public_insert"
  ON reviews FOR INSERT
  WITH CHECK (true);

-- Merchants can update (approve/hide) and delete reviews for their restaurant
CREATE POLICY "reviews_merchant_manage"
  ON reviews FOR ALL
  USING (
    restaurant_id = (SELECT restaurant_id FROM user_profiles WHERE id = auth.uid())
  );

-- Super admin full access
CREATE POLICY "reviews_admin_all"
  ON reviews FOR ALL
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- ============================================================
-- INDEXES
-- ============================================================

-- Storefront: fetch approved reviews for a restaurant, newest first
CREATE INDEX IF NOT EXISTS reviews_restaurant_approved
  ON reviews (restaurant_id, is_approved, created_at DESC)
  WHERE is_approved = true;

-- Average rating aggregation
CREATE INDEX IF NOT EXISTS reviews_restaurant_rating
  ON reviews (restaurant_id, rating)
  WHERE is_approved = true;

-- Merchant dashboard: all reviews (including unapproved) for their restaurant
CREATE INDEX IF NOT EXISTS reviews_restaurant_all
  ON reviews (restaurant_id, created_at DESC);
