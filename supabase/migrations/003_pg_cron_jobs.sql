-- ============================================================
-- pg_cron Scheduled Jobs
-- PRD §9.3
--
-- IMPORTANT: pg_cron must be enabled first via Supabase Dashboard:
-- Database > Extensions > search "pg_cron" > Enable
-- Then re-run these manually in the SQL Editor.
-- ============================================================

-- Wrapped in DO block to skip gracefully if pg_cron is not yet enabled
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Retry failed SMS every 15 minutes
    PERFORM cron.schedule(
      'retry-failed-sms',
      '*/15 * * * *',
      $job$
      SELECT net.http_post(
        url := current_setting('app.edge_function_base_url') || '/retry-sms',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
          'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
      )
      $job$
    );

    -- Expire share link tokens older than 6 hours
    PERFORM cron.schedule(
      'expire-share-link-tokens',
      '0 * * * *',
      $job$
      UPDATE delivery_assignments
      SET share_link_token = NULL
      WHERE
        share_link_token IS NOT NULL
        AND assigned_at < now() - interval '6 hours'
      $job$
    );

    RAISE NOTICE 'pg_cron jobs scheduled successfully';
  ELSE
    RAISE NOTICE 'pg_cron extension not enabled — skipping cron job setup. Enable it via Supabase Dashboard and run these manually.';
  END IF;
END
$$;
