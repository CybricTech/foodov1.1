-- ============================================================
-- 081: Reconcile orphaned "pending" payments
--
-- Closes the gap where a customer pays (esp. Paystack bank-transfer, which
-- settles asynchronously on the NIP rail) but then closes the checkout page
-- before the funds land. If the live charge.success webhook also drops, the
-- payment is stranded: money collected at the gateway, no order, merchant
-- never credited — with no recovery path today.
--
-- Strategy: a cron-driven edge function (reconcile-pending-payments) replays
-- the customer's status poll (GET /api/checkout/status) for every stuck
-- payment. That endpoint re-verifies with the gateway and either creates the
-- order (on success, atomically + idempotently) or marks it rejected (on a
-- terminal failure). No order-creation logic is duplicated.
--
-- Requires pg_cron + pg_net (enabled in migration 033) and the GUCs
-- app.supabase_url / app.service_role_key (same as the settlement cron, 016).
-- The edge function additionally needs the APP_BASE_URL secret:
--   supabase secrets set APP_BASE_URL=https://<your-web-app-domain>
-- ============================================================

-- Fast scan for the cron: only un-fulfilled payments, newest-first within the
-- reconciliation window. Partial index keeps it tiny (most payments have an
-- order_id and are excluded).
CREATE INDEX IF NOT EXISTS payments_unfulfilled_pending
  ON payments (created_at)
  WHERE order_id IS NULL
    AND (paystack_status = 'pending' OR monnify_status = 'pending');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Unschedule first so this migration is safe to re-run.
    BEGIN
      PERFORM cron.unschedule('reconcile-pending-payments');
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    -- Every 5 minutes. The edge function only touches payments older than a few
    -- minutes, so it never races the live webhook / browser status poll.
    PERFORM cron.schedule(
      'reconcile-pending-payments',
      '*/5 * * * *',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.supabase_url') || '/functions/v1/reconcile-pending-payments',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.service_role_key')
        ),
        body := '{}'::jsonb
      );
      $cron$
    );

    RAISE NOTICE 'reconcile-pending-payments cron scheduled (every 5 min)';
  ELSE
    RAISE NOTICE 'pg_cron not enabled — skipping reconcile-pending-payments schedule';
  END IF;
END $$;
