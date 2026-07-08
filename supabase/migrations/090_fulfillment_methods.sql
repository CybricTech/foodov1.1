-- ============================================================================
-- 090: Merchant fulfillment methods (delivery-only / pickup-only)
-- ============================================================================
-- Until now every storefront offered BOTH delivery and pickup — the checkout
-- rendered both buttons unconditionally and nothing in the schema said
-- otherwise. Some merchants only deliver (no walk-in counter) and some only
-- do pickup (no riders), so this adds two per-merchant switches, following
-- the existing accepts_orders naming:
--
--   restaurants.accepts_delivery  BOOLEAN NOT NULL DEFAULT true
--   restaurants.accepts_pickup    BOOLEAN NOT NULL DEFAULT true
--
-- Both default true, so existing merchants are unaffected. A CHECK guarantees
-- at least one method stays on — a store with neither would be unable to
-- take any order, which is what accepts_orders (manual close) is for.
--
-- Enforcement lives in two places:
--   - checkout UI hides/locks the disabled method (client, cached ≤5 min)
--   - /api/checkout/initialize rejects a disabled fulfillment_type with 409
--     (server, immediate — the source of truth)
-- ============================================================================

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS accepts_delivery BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS accepts_pickup   BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE restaurants
  ADD CONSTRAINT restaurants_fulfillment_method_required
  CHECK (accepts_delivery OR accepts_pickup);

COMMENT ON COLUMN restaurants.accepts_delivery IS
  'Merchant offers delivery orders. Both this and accepts_pickup default '
  'true; the restaurants_fulfillment_method_required CHECK keeps at least '
  'one on. Enforced at checkout in /api/checkout/initialize.';

COMMENT ON COLUMN restaurants.accepts_pickup IS
  'Merchant offers pickup (customer collects) orders. Both this and '
  'accepts_delivery default true; the restaurants_fulfillment_method_required '
  'CHECK keeps at least one on. Enforced at checkout in '
  '/api/checkout/initialize.';
