-- ============================================================
-- 062: Harden mark_late_orders() against cron pile-up
--
-- Incident (2026-06-05 ~20:00 UTC): the every-minute `mark-late-orders`
-- cron had NO overlap protection. With lock_timeout = 0 (wait forever),
-- one slow UPDATE caused the next minute's run to start on top of it and
-- block on row locks. Runs snowballed (25 starts in one minute), exhausting
-- the Micro instance's background workers / 60-connection pool
-- ("job startup timeout" x85). Auth (GoTrue) was starved of connections,
-- returning Cloudflare 522s; logins hung and Vercel functions timed out.
-- A project restart cleared it but left the root cause in place.
--
-- Fix:
--   1. pg_try_advisory_xact_lock — if a previous run is still active, the
--      new invocation returns immediately instead of piling up. The lock is
--      transaction-scoped (pg_cron runs each job in its own txn) and auto-
--      releases on commit.
--   2. Function-scoped statement_timeout (30s) and lock_timeout (5s) so a
--      single invocation can NEVER hold a worker/connection for minutes,
--      even if the advisory guard is somehow bypassed.
-- The every-minute schedule is preserved; behaviour is unchanged in the
-- normal case.
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
     AND status NOT IN ('delivered','cancelled');
END;
$function$;
