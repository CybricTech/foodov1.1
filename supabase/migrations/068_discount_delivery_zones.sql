-- ============================================================
-- 068: Geo-fenced discounts (delivery zones).
--
-- A discount (typically free_delivery, automatic) can target one or
-- more delivery zones — a named centre + radius. The discount applies
-- only when the order's destination coordinates fall within a zone.
--
-- Coordinates flow from Google Places / device GPS through checkout
-- (see migration 067 + the coordinates-first pricing work), so zone
-- matching is exact — no fragile address string matching.
--
-- Shape: JSONB array of { name: text, lat: number, lng: number,
-- radius_m: number }. NULL / empty array = applies everywhere (the
-- existing behaviour, unchanged).
-- ============================================================

ALTER TABLE discounts
  ADD COLUMN IF NOT EXISTS delivery_zones JSONB;

-- ============================================================
-- Dispatch attribution for free-delivery offers. The merchant declares,
-- on the promo, which rider fulfils these orders. The value reuses the
-- existing orders.dispatch_type vocabulary (migration 029) so it can be
-- stamped straight onto the order at creation and settle through the
-- canonical net formula (packages/utils/settlements.ts) with no change:
--   'own_rider'      -> merchant delivers; Foodo takes only the 10%
--                       delivery commission.
--   'platform_rider' -> Foodo dispatches; Foodo's commission is 100% of
--                       the delivery fee, so on a free-delivery order the
--                       merchant is debited the full fee (merchant-funded)
--                       and the platform is never out of pocket.
-- NULL for non-free-delivery offers.
-- ============================================================
ALTER TABLE discounts
  ADD COLUMN IF NOT EXISTS free_delivery_dispatch TEXT
    CHECK (free_delivery_dispatch IS NULL
           OR free_delivery_dispatch IN ('own_rider', 'platform_rider'));
