-- ============================================================
-- 087: Scheduled orders (pre-ordering / order-ahead)
--
-- A scheduled order is a NORMAL order (status 'confirmed', fully paid) that
-- additionally carries `scheduled_for` (the booked slot) and starts with
-- `activated_at = NULL`. "Entering the live kitchen queue" is one column
-- flip — `activated_at = now()` — done by the every-minute cron below or by
-- a merchant's manual "start now" (pull-forward) action. orders.status keeps
-- its exact existing values; settlements, dispatch, the late-order cron and
-- every other consumer are untouched.
--
-- `scheduled_for` stays populated after activation (permanent marker that the
-- order was booked ahead, so receipts/history can still show the slot); the
-- Scheduled-vs-New split is always `scheduled_for IS NOT NULL AND
-- activated_at IS NULL` (see packages/utils/src/order-buckets.ts — the single
-- shared predicate for web + mobile).
-- ============================================================

-- ── New order columns ────────────────────────────────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ DEFAULT NULL,
  -- Dedupes the merchant "slot approaching" push (scheduled-order-alerts fn).
  ADD COLUMN IF NOT EXISTS scheduled_alert_sent_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN orders.scheduled_for IS
  'Booked slot start time for pre-orders. NULL = ordinary order-now. Stays populated after activation.';
COMMENT ON COLUMN orders.activated_at IS
  'When a scheduled order entered the live kitchen queue (cron or merchant pull-forward). NULL while still waiting.';

-- ── Merchant scheduling config ───────────────────────────────
-- Single JSONB blob, same convention as opening_hours (migration 024). Shape:
-- {
--   "enabled": false,
--   "booking_horizon_hours": 72,      -- how far ahead customers may book
--   "slot_granularity_minutes": 30,   -- slot size (15/30/60)
--   "capacity_per_slot": null,        -- soft cap, informational on the dashboard
--   "alert_lead_minutes": 30,         -- merchant push this long before the slot
--   "self_cancel_cutoff_minutes": 60, -- customer may self-cancel until slot − cutoff
--   "min_lead_minutes": 20,           -- earliest bookable slot from "now"
--   "paused_ranges": []               -- [{"from": ISO, "to": ISO}] blackout windows
-- }
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS scheduling_settings JSONB DEFAULT NULL;

-- ── Indexes (partial-index convention from 035/061/081) ──────
-- Drives both crons: pending activations ordered by slot time.
CREATE INDEX IF NOT EXISTS orders_scheduled_pending_activation
  ON orders (scheduled_for)
  WHERE scheduled_for IS NOT NULL
    AND activated_at IS NULL
    AND status <> 'cancelled';

-- Drives dashboard/admin scheduled queries + per-slot capacity counts.
CREATE INDEX IF NOT EXISTS orders_restaurant_scheduled
  ON orders (restaurant_id, scheduled_for)
  WHERE scheduled_for IS NOT NULL;

-- ── sms_logs event types (extends CHECK from 022) ────────────
ALTER TABLE sms_logs
  DROP CONSTRAINT IF EXISTS sms_logs_event_type_check;

ALTER TABLE sms_logs
  ADD CONSTRAINT sms_logs_event_type_check
  CHECK (event_type IN (
    -- legacy values (kept for existing rows)
    'order_confirmation',
    'order_status_update',
    'marketing',
    -- values used by send-sms function
    'order_confirmed',
    'order_preparing',
    'order_ready',
    'order_in_transit',
    'order_delivered',
    'order_cancelled',
    'new_order_merchant',
    -- scheduled orders (087)
    'booking_confirmed',
    'order_rescheduled',
    'order_declined'
  ));

-- ── Activation cron function ─────────────────────────────────
-- Hardened exactly like mark_late_orders (062/071/083): advisory-lock guarded
-- (new key 4915233008, distinct from late-orders' ...007), function-scoped
-- statement/lock timeouts so one invocation can never pile up connections.
CREATE OR REPLACE FUNCTION public.activate_scheduled_orders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '30s'
SET lock_timeout = '5s'
AS $function$
BEGIN
  -- Skip entirely if a previous invocation is still running (see 062 incident).
  IF NOT pg_try_advisory_xact_lock(4915233008) THEN
    RAISE NOTICE 'activate_scheduled_orders: previous run still active, skipping';
    RETURN;
  END IF;

  UPDATE orders
     SET activated_at = now(),
         updated_at   = now()
   WHERE scheduled_for IS NOT NULL
     AND scheduled_for <= now()
     AND activated_at IS NULL
     AND status <> 'cancelled';
END;
$function$;

-- ── Cron schedules ───────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Re-runnable: unschedule first.
    BEGIN
      PERFORM cron.unschedule('activate-scheduled-orders');
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    BEGIN
      PERFORM cron.unschedule('scheduled-order-alerts');
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    -- 1) Activation: direct SQL every minute (same as mark-late-orders).
    PERFORM cron.schedule(
      'activate-scheduled-orders',
      '* * * * *',
      'SELECT public.activate_scheduled_orders();'
    );

    -- 2) Merchant "slot approaching" alerts: edge function fan-out every
    --    minute (http_post pattern from 081 — pushes can't be done in SQL).
    PERFORM cron.schedule(
      'scheduled-order-alerts',
      '* * * * *',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.supabase_url') || '/functions/v1/scheduled-order-alerts',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.service_role_key')
        ),
        body := '{}'::jsonb
      );
      $cron$
    );

    RAISE NOTICE 'scheduled-orders crons scheduled (every minute)';
  ELSE
    RAISE NOTICE 'pg_cron not enabled — skipping scheduled-orders cron setup';
  END IF;
END $$;
