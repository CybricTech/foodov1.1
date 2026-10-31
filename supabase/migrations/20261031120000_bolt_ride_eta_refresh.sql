-- Rider ETA on the merchant order board.
--
-- bolt_rides.eta_seconds is written by applyRideState, which only runs when a
-- Bolt webhook arrives or the reconcile cron sees a state change. Between
-- state changes nothing refreshes it, so on its own it is "the ETA at the
-- moment the driver accepted" — fine for disputes, wrong for "how far away is
-- the rider right now".
--
-- The merchant board's rider panel (GET /api/dashboard/orders/rider) refreshes
-- the ETA from Bolt's /rides/details on demand, throttled per ride. It records
-- when it did so here rather than in updated_at, because the reconcile cron
-- uses updated_at to decide which rides are overdue for a state poll: bumping
-- it on every ETA refresh would hide a ride whose webhook went missing.
--
-- Additive and nullable: the app tolerates this column being absent (it falls
-- back to updated_at as the ETA's reference time), so deploy order between
-- this migration and the web app does not matter.

ALTER TABLE bolt_rides
  ADD COLUMN IF NOT EXISTS eta_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN bolt_rides.eta_updated_at IS
  'When eta_seconds was last refreshed on demand by the merchant rider panel. '
  'NULL means eta_seconds is as of updated_at (the last webhook / cron apply).';
