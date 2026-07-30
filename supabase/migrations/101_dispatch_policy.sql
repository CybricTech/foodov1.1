-- ============================================================================
-- 101: Merchant dispatch policy + time-driven rider requests
-- ============================================================================
-- Three ideas were collapsed into one click. Tapping "Mark Ready" on a delivery
-- order made /api/dashboard/orders/dispatch pick the lane, write the delivery-fee
-- wallet split, advance orders.status AND ask for a rider, all at once. Three
-- consequences:
--
--   1. restaurants.logistics_default (migration 001) was decorative — nothing in
--      the dispatch path read it, so every merchant saw the same platform/own
--      picker whether or not they owned a single bike.
--   2. The rider was only sought once the food was already cooked, so the
--      customer waited the prep time and THEN waited for a rider to be found and
--      driven to the store.
--   3. 'assigned_to_rider' meant both "a rider was asked for" and "the merchant
--      is locked out of this order" (update-status/route.ts). That conflation is
--      what made moving the request earlier impossible: asking for a rider
--      necessarily took the merchant's Mark Ready button away.
--
-- This migration splits those apart along two independent axes:
--
--   dispatch_policy (per merchant)   who rides   platform | in_house | hybrid
--   bolt_booking_enabled (platform)  how we ask  Bolt API | Telegram note
--
-- The policy decides WHEN and WHETHER a rider is requested. The mode decides
-- only whether that request leaves as an API booking or as a note for a human.
-- A platform merchant behaves identically under both, which is what makes the
-- mode switch safe to flip mid-service.
--
-- Behaviour per policy:
--   platform  no picker; rider requested at estimated_delivery_at − lead, or at
--             Mark Ready, whichever comes FIRST
--   in_house  no picker; Mark Ready → Hand to Rider → in_transit; never requests
--   hybrid    today's two-button picker, unchanged
--
-- WHY dispatch_policy IS A NEW COLUMN AND NOT A VALUE ON logistics_default
-- ------------------------------------------------------------------------
-- recompute_restaurant_wallet (059) resolves an order's lane as
--   COALESCE(o.dispatch_type, da.dispatch_type, r.logistics_default)
-- and feeds it to foodo_order_net_kobo, whose CASE is
--   platform_rider           -> p_delivery
--   own_rider|third_party    -> ROUND(p_delivery * p_dc_pct)
--   ELSE                     -> 0
-- Adding 'hybrid' to logistics_default's CHECK would drop every order with a
-- NULL dispatch_type at a hybrid merchant into that ELSE — we would silently
-- stop taking the 10% delivery commission, in the canonical formula, on the
-- fallback path, with no error raised. The same shape recurs in 080, 089 and
-- 098. So logistics_default is left exactly as it is and demoted in its COMMENT
-- to what it actually still does: a settlement fallback for legacy rows.
-- ============================================================================

-- ── 1. Per-merchant policy ──────────────────────────────────────────────────

ALTER TABLE restaurants
  -- Backfills to 'hybrid' for EVERY existing merchant, deliberately: hybrid is
  -- precisely today's behaviour, so this migration is a no-op at runtime and
  -- merchants move onto the new lanes one at a time. Deriving it from
  -- logistics_default would silently change behaviour based on a field nobody
  -- has been maintaining, because nothing has ever enforced it.
  ADD COLUMN IF NOT EXISTS dispatch_policy TEXT NOT NULL DEFAULT 'hybrid'
    CHECK (dispatch_policy IN ('platform', 'in_house', 'hybrid')),

  -- Admin brake. Policy is merchant-editable (a merchant knows on Tuesday that
  -- their rider quit), but a merchant switching themselves to 'platform' starts
  -- spending our Bolt budget. Non-NULL freezes the field to admins only.
  ADD COLUMN IF NOT EXISTS dispatch_policy_locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dispatch_policy_locked_by UUID REFERENCES auth.users(id),

  -- Per-merchant override of platform_settings.rider_request_lead_minutes. A
  -- store 20 minutes from where riders idle needs a longer lead than one in the
  -- middle of town. NULL = use the platform default.
  ADD COLUMN IF NOT EXISTS rider_request_lead_minutes INTEGER
    CHECK (rider_request_lead_minutes IS NULL
           OR rider_request_lead_minutes BETWEEN 0 AND 120);

COMMENT ON COLUMN restaurants.dispatch_policy IS
  'Who handles this merchant''s deliveries. platform = Kitchyn rides (rider '
  'requested automatically before the food is ready); in_house = merchant''s own '
  'riders, never requested from us; hybrid = merchant chooses per order, which is '
  'the pre-101 behaviour and the backfill value for every existing merchant.';

COMMENT ON COLUMN restaurants.rider_request_lead_minutes IS
  'How many minutes before estimated_delivery_at to request the rider. NULL '
  'falls back to platform_settings.rider_request_lead_minutes. Only consulted '
  'for dispatch_policy = platform.';

COMMENT ON COLUMN restaurants.logistics_default IS
  'LEGACY — not a dispatch control and never was. Read only as the last COALESCE '
  'arm in recompute_restaurant_wallet / foodo_order_net_kobo, to settle orders '
  'predating dispatch_type stamping. Dispatch behaviour lives in '
  'dispatch_policy (migration 101). Do NOT add values to this column''s CHECK: '
  'anything the settlement CASE does not recognise settles as zero commission.';

-- Enforce the lock in the database, not the form.
--
-- Merchants update their own restaurants row directly through PostgREST under
-- RLS, so a disabled <select> in Settings is decoration — anyone with the
-- merchant's session can PATCH the column. Since dispatch_policy decides who
-- pays for the last mile, the lock has to be a column-level guard.
--
-- Fires only on an actual CHANGE, so a locked merchant saving unrelated
-- settings (which round-trips the unchanged value) is unaffected.
CREATE OR REPLACE FUNCTION enforce_dispatch_policy_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.dispatch_policy IS NOT DISTINCT FROM OLD.dispatch_policy THEN
    RETURN NEW;
  END IF;

  IF OLD.dispatch_policy_locked_at IS NULL THEN
    RETURN NEW;
  END IF;

  -- The service role (auth.uid() IS NULL) is our own server-side code, which
  -- has already done its own authorisation; super admins set the lock in the
  -- first place.
  IF auth.uid() IS NULL
     OR EXISTS (SELECT 1 FROM user_profiles
                 WHERE id = auth.uid() AND role = 'super_admin') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'dispatch_policy is locked for this merchant — contact your Kitchyn account manager'
    USING ERRCODE = 'check_violation';
END $$;

DROP TRIGGER IF EXISTS trg_enforce_dispatch_policy_lock ON restaurants;
CREATE TRIGGER trg_enforce_dispatch_policy_lock
  BEFORE UPDATE OF dispatch_policy ON restaurants
  FOR EACH ROW
  EXECUTE FUNCTION enforce_dispatch_policy_lock();

-- ── 2. The rider track ──────────────────────────────────────────────────────
-- orders.status tracks the FOOD; dispatch_state tracks the RIDER. They advance
-- independently, because from here a rider can be en route while the food is
-- still in the pan — which is the entire point of the redesign.
--
--   status:         confirmed → preparing → ready_for_pickup → in_transit → delivered
--   dispatch_state:            pending → requested → booked → driver_assigned
--                              → picked_up → delivered
--
-- dispatch_state = 'picked_up' is what drives status → in_transit: the rider
-- physically holding the food is the real transition, and the Bolt webhook
-- already reports it. On the manual lane the admin riders console advances it.
--
-- It lives on orders rather than being read off bolt_rides.state because
-- bolt_rides only exists for the Bolt lane; this has to be true on the manual
-- lane too. It is a projection — bolt_rides and delivery_assignments remain the
-- source of truth for their own lanes.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS dispatch_state TEXT
    CHECK (dispatch_state IS NULL OR dispatch_state IN (
      'not_required',    -- pickup order, or an in_house merchant's delivery
      'pending',         -- delivery awaiting its request; due_at may be set
      'requested',       -- Telegram note sent, or Bolt create in flight
      'booked',          -- Bolt ride created, searching for a driver
      'driver_assigned', -- a driver accepted and is heading to the store
      'picked_up',       -- rider has the food → flips orders.status to in_transit
      'delivered',
      'failed',          -- no driver found / create failed; needs a human
      'cancelled'
    )),

  -- When the rider should be requested: estimated_delivery_at − lead.
  --
  -- Stored rather than computed in the cron's predicate (which could just as
  -- well scan estimated_delivery_at <= now() + lead). Storing it means the
  -- countdown can be forced with a single UPDATE for testing, instead of having
  -- to falsify a customer-facing ETA; it also survives a merchant revising the
  -- ETA after the request has already gone out.
  ADD COLUMN IF NOT EXISTS rider_request_due_at TIMESTAMPTZ,

  -- OUTER idempotency latch: "a rider request is in flight for this order",
  -- claimed atomically (WHERE rider_requested_at IS NULL) the way
  -- rider_alert_sent_at is in migration 063. One claim covers both transports
  -- and both triggers, so the T−10 cron and an early Mark Ready cannot both
  -- request a rider for the same order.
  --
  -- The two existing latches stay as INNER, transport-level dedup:
  --   rider_alert_sent_at     Telegram sent (063)
  --   bolt_booking_claimed_at Bolt booking claimed (095)
  ADD COLUMN IF NOT EXISTS rider_requested_at TIMESTAMPTZ,

  -- Which trigger fired, for the riders console and for tuning the lead time.
  ADD COLUMN IF NOT EXISTS rider_request_source TEXT;

COMMENT ON COLUMN orders.dispatch_state IS
  'Rider-side lifecycle, independent of orders.status (which tracks the food). '
  'Projection of whichever lane is live — bolt_rides for the API lane, the admin '
  'riders console for the manual one.';

COMMENT ON COLUMN orders.rider_request_due_at IS
  'When the rider should be requested (estimated_delivery_at − lead). NULL means '
  'never time-triggered: pickup, in_house, hybrid, or a merchant who gave no prep '
  'estimate — those fall back to the Mark Ready trigger, so a request is never '
  'silently dropped.';

COMMENT ON COLUMN orders.rider_requested_at IS
  'Outer idempotency latch for "a rider has been asked for", claimed atomically '
  'by requestRiderForOrder(). Covers the Bolt and Telegram transports and the '
  'timed and Mark-Ready triggers alike.';

-- The cron's only scan. Partial index keeps it tiny even as orders grows —
-- same pattern as orders_awaiting_bolt_booking (095) and 081.
CREATE INDEX IF NOT EXISTS orders_rider_request_due
  ON orders (rider_request_due_at)
  WHERE rider_requested_at IS NULL AND rider_request_due_at IS NOT NULL;

-- ── 3. Live tracking link ───────────────────────────────────────────────────
-- GET /rides/details returns a Bolt-hosted tracking page for the ride. Stored
-- so the customer's "on its way" SMS can carry it, and so the riders console
-- can open the same page a customer is looking at when they call to complain.
-- Nullable and treated as optional everywhere: a ride booked by hand has no
-- ride_id we could query, so the manual lane never has one.

ALTER TABLE bolt_rides
  ADD COLUMN IF NOT EXISTS tracking_url TEXT;

COMMENT ON COLUMN bolt_rides.tracking_url IS
  'Bolt-hosted live tracking page, from GET /rides/details. NULL on the manual '
  'lane and until the first details poll returns one.';

-- ── 4. Platform defaults + rollout switch ───────────────────────────────────

ALTER TABLE platform_settings
  ADD COLUMN IF NOT EXISTS rider_request_lead_minutes INTEGER NOT NULL DEFAULT 10
    CHECK (rider_request_lead_minutes BETWEEN 0 AND 120),

  -- Master switch for the WHOLE time-driven mechanism, independent of the Bolt
  -- master switch. FALSE = the cron is a platform-wide no-op and rider requests
  -- happen exactly where they do today, at the merchant's dispatch click.
  -- Ships FALSE: migration applies, code deploys, nothing changes.
  ADD COLUMN IF NOT EXISTS timed_rider_request_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN platform_settings.timed_rider_request_enabled IS
  'Kill switch for time-driven rider requests. FALSE = riders are requested at '
  'the merchant''s dispatch click, exactly as before migration 101. Independent '
  'of bolt_booking_enabled, which only chooses the transport.';

COMMENT ON COLUMN platform_settings.rider_request_lead_minutes IS
  'Platform default lead time in minutes; restaurants.rider_request_lead_minutes '
  'overrides per merchant.';

-- ── 5. Backfill dispatch_state for in-flight orders ─────────────────────────
-- Only touches orders that are still open, and only to describe what is already
-- true of them. Deliberately not backfilling terminal orders: orders carries a
-- BEFORE UPDATE trigger stamping updated_at, so rewriting history to store a
-- derivable fact would re-date every delivered order (same reasoning as
-- delivery_cost_source in 095).

UPDATE orders
   SET dispatch_state = CASE
         WHEN fulfillment_type <> 'delivery'   THEN 'not_required'
         WHEN status = 'in_transit'            THEN 'picked_up'
         WHEN status = 'assigned_to_rider'     THEN 'requested'
         ELSE 'pending'
       END
 WHERE dispatch_state IS NULL
   AND status IN ('confirmed', 'preparing', 'ready_for_pickup',
                  'assigned_to_rider', 'in_transit');

-- Orders already dispatched pre-101 have had their rider asked for; stamp the
-- outer latch so the new chokepoint cannot ask a second time for the same food.
UPDATE orders
   SET rider_requested_at = COALESCE(rider_alert_sent_at, bolt_booking_claimed_at, updated_at)
 WHERE rider_requested_at IS NULL
   AND status IN ('assigned_to_rider', 'in_transit')
   AND fulfillment_type = 'delivery';
