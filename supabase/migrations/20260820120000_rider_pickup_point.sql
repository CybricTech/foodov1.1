-- ============================================================================
-- Rider pickup point
-- ============================================================================
-- Bolt sends riders to exactly the coordinate we give it. Probing
-- /rides/estimations for all 14 stores with coordinates on 2026-08-20 showed
-- Bolt echoes our lat/lng back with 0m drift on every one, and no store falls
-- in a custom_area — so it never snaps, never reroutes. Whatever point we send
-- IS the pickup.
--
-- Today that point is restaurants.latitude/longitude, which migration 094
-- derives from a picked Google place. That coordinate is correct as the
-- *business location*, but it is not necessarily where a motorbike should stop:
-- it is the venue centroid, not the gate, the kerb, or the right side of a
-- divided road.
--
-- It also drives what the rider is told. Bolt has no venue name for our stores
-- (confirmed: all 14 reverse-geocode to a street, none to a business), so the
-- pickup label is whatever road is nearest the point we send. That label moves
-- with the pin, and it moves at surprisingly small distances:
--
--   By Sophie's Confectionary  centre     -> "Bala Sokoto Way"
--                              30m east   -> "260 Adamu Ciroma Crescent"  (its
--                                            own stored address, exactly)
--   Sombrero                   centre     -> "Nile Street"
--                              30m north  -> "Anambra Crescent"
--
-- So a pickup point a few metres off the centroid can put the rider at the
-- right door AND make Bolt name the right street, with no dependency on
-- stops[].address (which Bolt gates behind their approval).
--
--   pickup_lat / pickup_lng  — where a rider should actually stop. NULL means
--                              "use latitude/longitude", so this is opt-in per
--                              store and changes nothing until someone sets it.
--   pickup_label             — the address Bolt resolved for that point when it
--                              was chosen, so the UI can show what riders are
--                              told without re-probing Bolt on every render.
--   pickup_point_set_at      — when it was last chosen.
--
-- Deliberately NOT used for delivery pricing: api/delivery/fee measures from
-- latitude/longitude and must keep doing so. A pickup point is allowed to sit
-- tens of metres away, and quietly moving the pricing origin is how GD-1331
-- happened.
-- ============================================================================

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS pickup_lat           NUMERIC,
  ADD COLUMN IF NOT EXISTS pickup_lng           NUMERIC,
  ADD COLUMN IF NOT EXISTS pickup_label         TEXT,
  ADD COLUMN IF NOT EXISTS pickup_point_set_at  TIMESTAMPTZ;

COMMENT ON COLUMN restaurants.pickup_lat IS
  'Where a rider should stop to collect, if it differs from the storefront centroid. NULL means use latitude. Never used for delivery pricing.';
COMMENT ON COLUMN restaurants.pickup_lng IS
  'Longitude counterpart to pickup_lat. Set and cleared together with it.';
COMMENT ON COLUMN restaurants.pickup_label IS
  'The address Bolt resolved for the pickup point when it was chosen — what the rider is shown. Cached for display only.';
COMMENT ON COLUMN restaurants.pickup_point_set_at IS
  'When the pickup point was last chosen. NULL when no point is set.';

-- Both halves of a coordinate travel together; one without the other is a bug,
-- not a state worth representing.
ALTER TABLE restaurants
  DROP CONSTRAINT IF EXISTS restaurants_pickup_point_complete;
ALTER TABLE restaurants
  ADD CONSTRAINT restaurants_pickup_point_complete
  CHECK ((pickup_lat IS NULL) = (pickup_lng IS NULL));

-- ----------------------------------------------------------------------------
-- A pickup point is meaningless once the address it was chosen against moves.
--
-- Enforced as a trigger rather than in the API on purpose: merchant writes
-- reach this table from several paths, and a stale pickup point is worse than
-- none — it would keep sending riders to the old shop's kerb indefinitely,
-- silently, with the label still reading as though it were verified.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION foodo_clear_pickup_point_on_move()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.latitude IS DISTINCT FROM OLD.latitude
     OR NEW.longitude IS DISTINCT FROM OLD.longitude THEN
    NEW.pickup_lat := NULL;
    NEW.pickup_lng := NULL;
    NEW.pickup_label := NULL;
    NEW.pickup_point_set_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clear_pickup_point_on_move ON restaurants;
CREATE TRIGGER trg_clear_pickup_point_on_move
  BEFORE UPDATE ON restaurants
  FOR EACH ROW
  EXECUTE FUNCTION foodo_clear_pickup_point_on_move();
