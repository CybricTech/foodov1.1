-- ============================================================================
-- Delivery address components, and what dispatch actually sent
-- ============================================================================
-- Checkout already computes everything needed to describe a delivery precisely
-- and then throws most of it away. `/api/checkout/initialize` receives
-- `deliveryBaseAddress` (the Google formatted address of the picked place) and
-- `deliveryPlaceId` (its stable reference), uses them for the Distance Matrix
-- call, and persists neither. What lands in `orders.delivery_address` is the
-- two halves glued together — `${baseAddress}, ${aptSuiteFloor}` — which cannot
-- be taken apart again.
--
-- The glue is where the damage is. Of twelve recent delivery addresses, five
-- were malformed, and not one of those was the dispatch provider's doing:
--
--   "11 Moundou Street, Wuse, Abuja, Nigeria, 11 moundou street"
--   "3FH2+X62, Mabushi, Abuja 900108, Federal Capital Territory, Nigeria"
--   "CITEC), Jabi, A7 Street, Airport Road, Abuja, Nigeria, A7 street house 16"
--   "Drizzleberry Cakes and Kraft, Abuja, Nigeria, 1st floor"
--
-- Storing the parts separately makes the address composable rather than
-- guessed at (see @foodo/utils composeDeliveryAddress), makes the place_id
-- re-resolvable years later, and makes a bad pick detectable instead of merely
-- unfortunate.
--
-- `delivery_address` is deliberately left exactly as it is. It stays the
-- display string everywhere it is already used, and remains the fallback for
-- the 600+ orders that predate these columns.
-- ============================================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_place_id     TEXT,
  ADD COLUMN IF NOT EXISTS delivery_base_address TEXT,
  ADD COLUMN IF NOT EXISTS delivery_apt_unit     TEXT;

COMMENT ON COLUMN orders.delivery_place_id IS
  'Google place_id of the address the customer picked at checkout. Stable reference — re-resolvable long after the order.';
COMMENT ON COLUMN orders.delivery_base_address IS
  'Google formatted_address of the picked place, without the apartment/floor text. The postal-valid half.';
COMMENT ON COLUMN orders.delivery_apt_unit IS
  'Apartment / suite / floor as the customer typed it. Kept apart from the address so it can never be mistaken for one.';

-- ----------------------------------------------------------------------------
-- What dispatch actually sent, and what the provider made of it.
--
-- Until now the address a rider saw was unobservable: Bolt reverse-geocodes the
-- coordinates and shows the result, and we recorded neither what we sent nor
-- what came back. Divergence was only ever discovered when a rider telephoned.
--
-- `*_label_bolt` is Bolt's own resolution of the coordinate, which arrives free
-- in the estimate response we already make and previously discarded. It is a
-- diagnostic, never displayed to anyone as an address — with both columns
-- populated, "how often does the provider's idea of an address disagree with
-- the customer's, and where" becomes a query instead of an anecdote.
-- ----------------------------------------------------------------------------
ALTER TABLE bolt_rides
  ADD COLUMN IF NOT EXISTS pickup_address_sent  TEXT,
  ADD COLUMN IF NOT EXISTS dropoff_address_sent TEXT,
  ADD COLUMN IF NOT EXISTS pickup_label_bolt    TEXT,
  ADD COLUMN IF NOT EXISTS dropoff_label_bolt   TEXT,
  ADD COLUMN IF NOT EXISTS address_mode         TEXT;

COMMENT ON COLUMN bolt_rides.pickup_address_sent IS
  'The pickup address we attached to stops[0]. NULL when the booking went out on coordinates alone.';
COMMENT ON COLUMN bolt_rides.dropoff_address_sent IS
  'The delivery address we attached to stops[1]. NULL when the booking went out on coordinates alone.';
COMMENT ON COLUMN bolt_rides.pickup_label_bolt IS
  'What Bolt reverse-geocoded the pickup coordinate to, from the estimate. Diagnostic only — never shown as an address.';
COMMENT ON COLUMN bolt_rides.dropoff_label_bolt IS
  'What Bolt reverse-geocoded the delivery coordinate to, from the estimate. Diagnostic only.';
COMMENT ON COLUMN bolt_rides.address_mode IS
  'with_address = stops carried our addresses; coordinates_only = they did not, either because the addresses were unusable or because Bolt rejected them.';

ALTER TABLE bolt_rides
  DROP CONSTRAINT IF EXISTS bolt_rides_address_mode_check;
ALTER TABLE bolt_rides
  ADD CONSTRAINT bolt_rides_address_mode_check
  CHECK (address_mode IS NULL OR address_mode IN ('with_address', 'coordinates_only'));
