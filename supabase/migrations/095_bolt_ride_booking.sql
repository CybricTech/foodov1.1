-- ============================================================================
-- 095: Bolt Ride Booker integration
-- ============================================================================
-- Platform-rider delivery is manual today: on dispatch lib/telegram.ts posts a
-- copy-paste "Note to driver" to a Telegram group, a human books the Bolt ride,
-- and days later an admin reads a Bolt CSV export and types each ride's cost
-- into the Riders page to close the order. Ten orders were sitting unclosed
-- when this work started, the oldest three days old, and a failed ride left no
-- record at all — no driver, no state, nothing to escalate with.
--
-- The governing constraint: **cost is only recoverable for rides we booked
-- ourselves.** Bolt has no endpoint that looks up a ride you did not create —
-- ride_id is returned exactly once, from POST /rides/create. So two lanes
-- exist permanently, and orders.delivery_cost_source records which one a given
-- order went through:
--
--   'bolt'   — we booked it; state and fare arrive automatically
--   'manual' — booked by hand; admin types the cost, exactly as today
--
-- Tables:
--   bolt_rides       one order -> many ride attempts. delivery_assignments is
--                    UNIQUE on order_id (migration 063) so it cannot hold a
--                    re-book, and re-books are common: in the 22-27 Jul export
--                    both AR-2030 and AR-2021 took a failed ride plus a second
--                    successful one. The timestamp columns double as the
--                    dispute timeline, so there is no separate events table.
--   bolt_auth_tokens singleton OAuth2 token cache, same shape as
--                    monnify_auth_tokens (migration 046).
--
-- Also repairs the migration-008 trigger. sync_order_delivery_status() maps
-- delivery_assignments.status = 'picked_up' to orders.status =
-- 'out_for_delivery', which is not a legal value under orders_status_check
-- (pending, confirmed, preparing, ready_for_pickup, assigned_to_rider,
-- in_transit, delivered, cancelled). Nothing writes 'picked_up' today, but
-- Bolt state tracking would be the first thing to, and every such write would
-- raise a check violation. The same CASE also maps 'accepted' -> 'confirmed',
-- which would drag a delivered order backwards. Narrowed to the two values
-- that are both legal and meaningful.
-- ============================================================================

-- ── 1. Ride attempts ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bolt_rides (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  restaurant_id       UUID NOT NULL REFERENCES restaurants(id) ON DELETE RESTRICT,
  -- 1-based, increments per re-book of the same order.
  attempt             INTEGER NOT NULL DEFAULT 1,
  environment         TEXT NOT NULL DEFAULT 'production'
                        CHECK (environment IN ('sandbox', 'production')),

  -- NULL until POST /rides/create returns. A row with no bolt_ride_id is
  -- either a shadow-mode estimate or a booking that failed before creation.
  bolt_ride_id        BIGINT,

  -- Bolt's ten ride states plus three of our own:
  --   PENDING_CREATE  row claimed, create not yet returned
  --   CREATE_FAILED   create errored; last_error explains
  --   SHADOW          estimated only, deliberately not booked
  state               TEXT NOT NULL DEFAULT 'PENDING_CREATE',

  -- Fare. Bolt speaks major units (12.5); everything here is kobo.
  fare_kobo           INTEGER CHECK (fare_kobo IS NULL OR fare_kobo >= 0),
  estimate_kobo       INTEGER CHECK (estimate_kobo IS NULL OR estimate_kobo >= 0),
  currency_code       TEXT,
  -- Receipt line items: [{type: 'booking_fee'|'ride_fee'|..., amount}]. The
  -- booking fee is a component of the total, not an addition to it.
  fare_breakdown      JSONB,
  invoice_url         TEXT,

  -- Driver, for live tracking and disputes.
  driver_name         TEXT,
  driver_phone        TEXT,
  vehicle_category    TEXT,
  eta_seconds         INTEGER,
  driver_lat          NUMERIC(10,7),
  driver_lng          NUMERIC(10,7),
  location_updated_at TIMESTAMPTZ,

  -- What we actually asked Bolt for, kept for dispute evidence.
  pickup_lat          NUMERIC(10,7),
  pickup_lng          NUMERIC(10,7),
  dropoff_lat         NUMERIC(10,7),
  dropoff_lng         NUMERIC(10,7),
  note_to_driver      TEXT,
  last_error          TEXT,
  last_error_code     TEXT,

  -- Timeline. This is the dispute record.
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  booked_at           TIMESTAMPTZ,
  driver_assigned_at  TIMESTAMPTZ,
  picked_up_at        TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  cancelled_at        TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bolt's ride_id is the webhook's dedup key: an unordered, duplicated delivery
-- resolves to exactly one row.
CREATE UNIQUE INDEX IF NOT EXISTS bolt_rides_ride_id_uniq
  ON bolt_rides (bolt_ride_id) WHERE bolt_ride_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS bolt_rides_order_attempt_uniq
  ON bolt_rides (order_id, attempt);

CREATE INDEX IF NOT EXISTS bolt_rides_order
  ON bolt_rides (order_id, attempt DESC);

-- Partial indexes keep the cron's scans tiny (pattern from migration 081).
CREATE INDEX IF NOT EXISTS bolt_rides_active
  ON bolt_rides (updated_at)
  WHERE state NOT IN (
    'COMPLETED', 'CANCELLED', 'CLIENT_CANCELLED', 'CLIENT_DID_NOT_SHOW',
    'NO_DRIVER_FOUND', 'PAYMENT_BOOKING_FAILED', 'CREATE_FAILED', 'SHADOW'
  );

CREATE INDEX IF NOT EXISTS bolt_rides_awaiting_receipt
  ON bolt_rides (completed_at)
  WHERE state = 'COMPLETED' AND fare_kobo IS NULL;

ALTER TABLE bolt_rides ENABLE ROW LEVEL SECURITY;

-- Admin-only, matching platform_settings. The service role bypasses RLS, so
-- the booking engine, webhook and cron need no policy of their own.
DROP POLICY IF EXISTS bolt_rides_admin_only ON bolt_rides;
CREATE POLICY bolt_rides_admin_only
  ON bolt_rides FOR ALL
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

COMMENT ON TABLE bolt_rides IS
  'One row per Bolt ride attempt. An order gets a second row when a ride is cancelled or the passenger is not found and it is re-booked.';
COMMENT ON COLUMN bolt_rides.fare_kobo IS
  'Final all-in fare from GET /rides/receipt, converted from major units. Includes the booking fee.';
COMMENT ON COLUMN bolt_rides.state IS
  'Bolt ride state, plus PENDING_CREATE / CREATE_FAILED / SHADOW for rides that never reached Bolt.';

-- ── 2. OAuth2 token cache ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bolt_auth_tokens (
  id           TEXT PRIMARY KEY DEFAULT 'singleton',
  access_token TEXT NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT bolt_auth_tokens_singleton CHECK (id = 'singleton')
);

ALTER TABLE bolt_auth_tokens ENABLE ROW LEVEL SECURITY;

-- Holds a bearer token: no client should ever read it.
DROP POLICY IF EXISTS bolt_auth_tokens_no_access ON bolt_auth_tokens;
CREATE POLICY bolt_auth_tokens_no_access
  ON bolt_auth_tokens FOR ALL TO authenticated, anon
  USING (false) WITH CHECK (false);

-- ── 3. Order-level booking state ────────────────────────────────────────────

ALTER TABLE orders
  -- Idempotency latch, same shape as rider_alert_sent_at (migration 063): the
  -- dispatch route reaches the booking call from three separate write paths.
  ADD COLUMN IF NOT EXISTS bolt_booking_claimed_at TIMESTAMPTZ,
  -- Admin brake on the auto-rebook loop, set from the Riders page.
  ADD COLUMN IF NOT EXISTS bolt_autobook_stopped_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bolt_autobook_stopped_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS delivery_cost_source TEXT
    CHECK (delivery_cost_source IS NULL OR delivery_cost_source IN ('bolt', 'manual'));

COMMENT ON COLUMN orders.bolt_booking_claimed_at IS
  'Claimed atomically before booking so concurrent dispatch paths cannot double-book. Released on failure so a retry can re-book.';
COMMENT ON COLUMN orders.delivery_cost_source IS
  'bolt = fare came from a Bolt receipt; manual = an admin typed it. NULL means the order predates the integration, which is equivalent to manual — every historical cost was typed by an admin. Deliberately not backfilled: orders carries a BEFORE UPDATE trigger that stamps updated_at, so rewriting history to store a derivable fact would re-date every delivered order.';

-- Cron/console scan: orders waiting on a rider that have no ride yet.
CREATE INDEX IF NOT EXISTS orders_awaiting_bolt_booking
  ON orders (bolt_booking_claimed_at)
  WHERE status = 'assigned_to_rider';

-- ── 4. Rollout controls ─────────────────────────────────────────────────────

ALTER TABLE platform_settings
  -- Master switch. While FALSE, dispatch behaves exactly as it does today:
  -- Telegram note, no API call.
  ADD COLUMN IF NOT EXISTS bolt_booking_enabled BOOLEAN NOT NULL DEFAULT false,
  -- Shadow mode. Estimates are fetched and recorded but no ride is booked and
  -- no money moves; the Telegram note still goes out.
  ADD COLUMN IF NOT EXISTS bolt_booking_shadow BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS bolt_environment TEXT NOT NULL DEFAULT 'sandbox'
    CHECK (bolt_environment IN ('sandbox', 'production'));

COMMENT ON COLUMN platform_settings.bolt_booking_enabled IS
  'Master switch / kill switch for Bolt booking. FALSE = dispatch falls back to the Telegram driver note.';
COMMENT ON COLUMN platform_settings.bolt_booking_shadow IS
  'When TRUE the engine estimates and logs what it would book, but books nothing.';

-- ── 5. Repair the migration-008 trigger ─────────────────────────────────────

CREATE OR REPLACE FUNCTION sync_order_delivery_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  UPDATE orders
  SET
    delivery_status = NEW.status,
    status = CASE NEW.status
      -- 'picked_up' previously mapped to 'out_for_delivery', which fails
      -- orders_status_check; 'accepted' mapped to 'confirmed', which would
      -- move an in-flight order backwards. Both dropped: in-progress delivery
      -- states are now recorded on delivery_status only, and orders.status is
      -- advanced explicitly by the code that owns the transition.
      WHEN 'delivered'  THEN 'delivered'
      WHEN 'cancelled'  THEN 'cancelled'
      ELSE status
    END,
    updated_at = NOW()
  WHERE id = NEW.order_id;

  RETURN NEW;
END;
$$;
