-- ============================================================================
-- 102: Time-driven rider request cron
-- ============================================================================
-- Every minute, ask /api/cron/request-due-riders whether any platform-policy
-- order is close enough to ready that we should go and find it a rider.
--
-- Same three-hop chain as 081/082/096: pg_cron -> net.http_post -> edge function
-- -> Next.js route, where the logic lives so it shares one chokepoint with the
-- merchant's Mark Ready and the hybrid picker.
--
-- Every minute is the right cadence and is affordable here: the route's only
-- query rides orders_rider_request_due (migration 101), a partial index over
-- orders that are due AND unrequested — usually zero rows, never more than the
-- handful in flight at once. Cheaper than the alternative of a coarser tick,
-- which would systematically request riders late by up to half its period.
--
-- No advisory lock (that pattern is for in-database cron functions — migration
-- 062). Overlap is bounded by the route: BATCH_LIMIT 50, a 90-minute overdue
-- floor, and per-order try/catch so one bad order can't abort the run.
--
-- The route ALSO checks platform_settings.timed_rider_request_enabled and
-- returns immediately when it is false, so scheduling this job is safe well
-- before the feature is turned on.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not enabled — skipping request-due-riders schedule';
    RETURN;
  END IF;

  -- Scheduling a GUC-based command when the GUCs are unset creates a job that
  -- ERRORs on every run and silently requests nothing. That fail-silent trap has
  -- bitten prod before (see migration 082), so refuse rather than pretend.
  -- Set once as superuser via Dashboard → SQL editor:
  --   ALTER DATABASE postgres SET app.supabase_url     = 'https://<ref>.supabase.co';
  --   ALTER DATABASE postgres SET app.service_role_key = '<service_role_key>';
  IF current_setting('app.supabase_url', true) IS NULL
     OR current_setting('app.service_role_key', true) IS NULL THEN
    RAISE WARNING 'request-due-riders NOT scheduled — app.supabase_url / app.service_role_key GUCs are unset. Set them (see comment above) then re-run this block. Until then riders are requested only at the merchant''s Mark Ready.';
    RETURN;
  END IF;

  BEGIN
    PERFORM cron.unschedule('request-due-riders');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  PERFORM cron.schedule(
    'request-due-riders',
    '* * * * *',
    $cron$
    SELECT net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/request-due-riders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body := '{}'::jsonb
    );
    $cron$
  );

  RAISE NOTICE 'request-due-riders cron scheduled (every minute)';
END $$;
