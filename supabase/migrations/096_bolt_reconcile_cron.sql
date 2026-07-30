-- ============================================================================
-- 096: Bolt ride reconciliation cron
-- ============================================================================
-- The Bolt webhook is the primary signal for ride state, but it is documented
-- as neither ordered nor deduplicated and can simply not arrive. Three failure
-- modes need a safety net:
--
--   1. A webhook never lands, leaving a ride stuck mid-flight and its order
--      parked in assigned_to_rider forever — the exact symptom this whole
--      integration exists to remove.
--   2. A ride completes before its receipt is ready (usually seconds, but Bolt
--      says up to 24h+ when a ride is under review), so the order is delivered
--      with no cost recorded.
--   3. Booking dies between claiming the order and writing a bolt_rides row.
--
-- Same three-hop chain as migrations 081/082: pg_cron -> net.http_post -> edge
-- function -> Next.js route, where the actual logic lives so it shares one
-- state machine with the webhook.
--
-- No advisory lock here (that pattern applies to in-database cron functions —
-- see migration 062). Overlap is bounded instead by the route's own batching:
-- BATCH_LIMIT 50, a 3-minute minimum age so it never races the webhook, and
-- per-item try/catch so one bad ride can't abort the run.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not enabled — skipping reconcile-bolt-rides schedule';
    RETURN;
  END IF;

  -- Scheduling a GUC-based command when the GUCs are unset creates a job that
  -- ERRORs on every run and silently reconciles nothing. That fail-silent trap
  -- has bitten prod before (see migration 082), so refuse rather than pretend.
  -- Set once as superuser via Dashboard → SQL editor:
  --   ALTER DATABASE postgres SET app.supabase_url     = 'https://<ref>.supabase.co';
  --   ALTER DATABASE postgres SET app.service_role_key = '<service_role_key>';
  IF current_setting('app.supabase_url', true) IS NULL
     OR current_setting('app.service_role_key', true) IS NULL THEN
    RAISE WARNING 'reconcile-bolt-rides NOT scheduled — app.supabase_url / app.service_role_key GUCs are unset. Set them (see comment above) then re-run this block. Until then Bolt rides are reconciled only by the webhook.';
    RETURN;
  END IF;

  BEGIN
    PERFORM cron.unschedule('reconcile-bolt-rides');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  PERFORM cron.schedule(
    'reconcile-bolt-rides',
    '*/5 * * * *',
    $cron$
    SELECT net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/reconcile-bolt-rides',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body := '{}'::jsonb
    );
    $cron$
  );

  RAISE NOTICE 'reconcile-bolt-rides cron scheduled (every 5 min)';
END $$;
