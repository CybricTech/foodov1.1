-- Run every hour — finds pending wallet_transactions past their available_at time
-- and triggers the process-settlements edge function.
-- Requires pg_cron + pg_net extensions enabled in Supabase Dashboard.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Unschedule first to allow re-running this migration safely
    BEGIN
      PERFORM cron.unschedule('release-pending-wallet-balances');
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    PERFORM cron.schedule(
      'release-pending-wallet-balances',
      '0 * * * *',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.supabase_url') || '/functions/v1/process-settlements',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.service_role_key')
        ),
        body := '{}'::jsonb
      );
      $cron$
    );
  END IF;
END $$;
