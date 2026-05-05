-- 044: Add dispatch_type to orders (idempotent catch-up)
-- Migration 029 added this column but was not applied to all environments.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS dispatch_type TEXT
    CHECK (dispatch_type IN ('platform_rider', 'own_rider', 'third_party'));

-- Back-fill from delivery_assignments where available
UPDATE orders o
SET dispatch_type = da.dispatch_type
FROM delivery_assignments da
WHERE da.order_id = o.id
  AND o.dispatch_type IS NULL;
