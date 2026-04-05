-- Add lat/lng to restaurants for distance calculation origin
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS latitude   NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS longitude  NUMERIC(10, 7);

-- The old flat delivery_fee column is kept for backward compat but is no longer
-- the source of truth at checkout — dynamic distance pricing is used instead.
COMMENT ON COLUMN restaurants.delivery_fee IS
  'DEPRECATED: Use dynamic distance-based pricing via /api/delivery/fee endpoint instead';

-- Snapshot columns on orders so we record what was charged and the distance
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_distance_km         NUMERIC(6, 2),
  ADD COLUMN IF NOT EXISTS delivery_fee_kobo_calculated BIGINT;
