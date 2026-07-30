-- ============================================================================
-- 094: Verified store address (Google Places)
-- ============================================================================
-- Settings currently collects a store's location twice, independently: a
-- free-text "Address" field shown on the storefront, and two hand-typed
-- latitude/longitude boxes ("open Google Maps, right-click, copy the
-- numbers"). Nothing ties them together, so they routinely disagree.
--
-- The Copper Pot is stored at 9.1469978, 7.3324919 while its address reads
-- "11 Adzope Crescent, Wuse 2" — Wuse 2 is around 9.08, 7.48. That is roughly
-- 20 km of error, and it is not cosmetic: api/delivery/fee/route.ts uses
-- restaurants.latitude/longitude as the Distance Matrix *origin*, so every
-- delivery quote that store issues is priced from the wrong place. Five more
-- active stores (MATCHA STREET, Moomooyogurt, Sombrero, Spicesenz, The Panini
-- Bar) have no coordinates at all and silently fall back to the flat base fee.
--
-- This replaces both inputs with a single Google Places picker. Coordinates
-- become derived data — never typed — exactly as migration 093-era checkout
-- already does for the delivery *destination* (see the GD-1331 note in
-- api/places/resolve/route.ts). One verified address per store then serves as
-- both the delivery-fee origin and, from migration 095, the Bolt pickup point.
--
--   place_id             — Google place reference the coordinates came from
--   location_verified_at — set when coordinates are resolved from a picked
--                          place; NULL means "typed or unknown, do not trust"
--
-- Existing rows keep their coordinates but stay unverified, so nothing changes
-- until a merchant or admin re-picks the address.
-- ============================================================================

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS place_id             TEXT,
  ADD COLUMN IF NOT EXISTS location_verified_at TIMESTAMPTZ;

COMMENT ON COLUMN restaurants.place_id IS
  'Google Places place_id the stored latitude/longitude were resolved from. NULL for legacy hand-typed coordinates.';

COMMENT ON COLUMN restaurants.location_verified_at IS
  'Set when latitude/longitude were resolved from a picked Google place. NULL means the coordinates are unverified — delivery pricing still uses them, but Bolt booking will not.';
