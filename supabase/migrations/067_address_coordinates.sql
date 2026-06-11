-- ============================================================
-- 067: Coordinate-backed delivery addresses (Phase 1 of
-- coordinates-first delivery pricing).
--
-- Saved addresses now store the lat/lng captured when the customer
-- picked the address (Places geometry or device GPS). Re-selecting a
-- saved address re-prices from coordinates with ZERO geocoding —
-- text never re-enters the distance calculation, eliminating the
-- wrong-street geocode class of bug (see order GD-1331: free-text
-- re-geocoding undercharged delivery by ~₦1.9k).
--
-- orders.delivery_lat / orders.delivery_lng already exist (001) and
-- are now written by the payment webhooks from checkout metadata.
-- ============================================================

ALTER TABLE customer_addresses
  ADD COLUMN IF NOT EXISTS lat NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS lng NUMERIC(10,7);
