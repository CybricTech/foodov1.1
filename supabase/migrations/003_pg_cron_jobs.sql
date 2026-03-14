-- ============================================================
-- pg_cron Scheduled Jobs
-- PRD §9.3
--
-- These jobs are set up after the Edge Functions are deployed.
-- Run this migration once the Supabase project is live.
-- ============================================================

-- Retry failed SMS every 15 minutes
SELECT cron.schedule(
  'retry-failed-sms',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.edge_function_base_url') || '/retry-sms',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  )
  $$
);

-- Expire share link tokens older than 6 hours
SELECT cron.schedule(
  'expire-share-link-tokens',
  '0 * * * *',  -- every hour
  $$
  UPDATE delivery_assignments
  SET share_link_token = NULL
  WHERE
    share_link_token IS NOT NULL
    AND assigned_at < now() - interval '6 hours'
  $$
);
