-- ============================================================
-- 033: Enable pg_cron + pg_net and register settlement cron job
-- - Enables pg_cron and pg_net extensions (were missing, causing
--   all wallet transactions to stay stuck in 'pending' forever)
-- - Registers daily 08:00 UTC cron to release pending balances
-- - One-time release of all overdue pending transactions
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net  WITH SCHEMA extensions;

-- Register (or re-register) the daily settlement cron job
SELECT cron.unschedule('release-pending-wallet-balances')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'release-pending-wallet-balances'
);

SELECT cron.schedule(
  'release-pending-wallet-balances',
  '0 8 * * *',
  $cron$
  SELECT net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/process-settlements',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body    := '{}'::jsonb
  );
  $cron$
);

-- Release all overdue pending transactions that were never processed
SELECT release_pending_wallet_balances();
