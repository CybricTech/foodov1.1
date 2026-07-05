-- ============================================================
-- 083: Scope mark_late_orders() to orders still being prepared
--
-- estimated_delivery_at now stores the "ready" time only — we dropped the
-- +30-minute delivery travel buffer because deliveries are fulfilled by
-- 3rd-party riders whose timing we can't control (the customer is shown a
-- ready estimate, not a delivery ETA).
--
-- Side-effect this migration fixes: without that buffer, every order that has
-- been made ready / dispatched (ready_for_pickup, assigned_to_rider,
-- in_transit) has an estimated_delivery_at in the past the moment it leaves the
-- kitchen, so the old "status NOT IN ('delivered','cancelled')" predicate would
-- flag essentially all in-transit orders as late. "Late" should mean the
-- kitchen hasn't produced the order by its promised ready time, so we restrict
-- the sweep to the pre-ready statuses (pending / confirmed / preparing).
--
-- Everything else (the advisory-lock overlap guard and per-call timeouts added
-- in migration 062 to prevent cron pile-up) is preserved verbatim.
-- ============================================================

CREATE OR REPLACE FUNCTION public.mark_late_orders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '30s'
SET lock_timeout = '5s'
AS $function$
BEGIN
  -- Skip entirely if a previous invocation is still running. Prevents the
  -- overlap avalanche that exhausted the connection pool on 2026-06-05.
  IF NOT pg_try_advisory_xact_lock(4915233007) THEN
    RAISE NOTICE 'mark_late_orders: previous run still active, skipping';
    RETURN;
  END IF;

  UPDATE orders
     SET late_at    = now(),
         updated_at = now()
   WHERE late_at IS NULL
     AND estimated_delivery_at IS NOT NULL
     AND estimated_delivery_at < now()
     -- Only orders still in the kitchen — once an order is ready/dispatched the
     -- ready-time estimate is naturally in the past and is no longer a "late"
     -- signal (delivery timing is on the 3rd-party rider, not the merchant).
     AND status IN ('pending', 'confirmed', 'preparing');
END;
$function$;
