-- ============================================================
-- 030: Manual Settlement Workflow & Delivery Commission Config
-- - Adds delivery_commission_pct to platform_settings (default 10%)
-- - Extends settlements table for manual bank transfer recording
-- - Adds settlement_id FK to orders for locking settled orders
-- ============================================================

-- 1. Add configurable delivery commission percentage to platform_settings
ALTER TABLE platform_settings
  ADD COLUMN IF NOT EXISTS delivery_commission_pct NUMERIC(5,4) NOT NULL DEFAULT 0.10;

-- 2. Extend settlements table with manual payout fields
ALTER TABLE settlements
  ADD COLUMN IF NOT EXISTS settlement_type TEXT NOT NULL DEFAULT 'automatic'
    CHECK (settlement_type IN ('manual', 'automatic')),
  ADD COLUMN IF NOT EXISTS bank_reference TEXT,
  ADD COLUMN IF NOT EXISTS receipt_url TEXT,
  ADD COLUMN IF NOT EXISTS recorded_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS period_date DATE,
  ADD COLUMN IF NOT EXISTS order_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gross_total_kobo BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS service_fee_total_kobo BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_commission_kobo BIGINT NOT NULL DEFAULT 0;

-- 3. Add settlement_id to orders for locking settled orders
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS settlement_id UUID REFERENCES settlements(id);

-- 4. Index for fast lookup of unsettled orders per restaurant per day
CREATE INDEX IF NOT EXISTS idx_orders_unsettled
  ON orders (restaurant_id, created_at)
  WHERE settlement_id IS NULL
    AND status NOT IN ('cancelled', 'pending');

-- 5. Index for settlement period lookups
CREATE INDEX IF NOT EXISTS idx_settlements_period
  ON settlements (restaurant_id, period_date);
