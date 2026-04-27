-- ============================================================
-- 029: Settlements Redesign
-- Adds dispatch_type to orders for tracking who handles delivery,
-- back-fills from delivery_assignments, and updates the settlement
-- cron to daily 9 AM WAT (08:00 UTC).
-- ============================================================

-- 1. Add dispatch_type to orders
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS dispatch_type TEXT
    CHECK (dispatch_type IN ('platform_rider', 'own_rider', 'third_party'));

-- 2. Back-fill from delivery_assignments where available
UPDATE orders o
SET dispatch_type = da.dispatch_type
FROM delivery_assignments da
WHERE da.order_id = o.id
  AND o.dispatch_type IS NULL;

-- 3. Back-fill remaining from restaurant's logistics_default
UPDATE orders o
SET dispatch_type = r.logistics_default
FROM restaurants r
WHERE r.id = o.restaurant_id
  AND o.dispatch_type IS NULL;

-- 4. Update pg_cron: daily at 08:00 UTC (9:00 AM WAT) instead of hourly
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Unschedule the old hourly job
    BEGIN
      PERFORM cron.unschedule('release-pending-wallet-balances');
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    -- Schedule daily at 08:00 UTC (9 AM WAT)
    PERFORM cron.schedule(
      'release-pending-wallet-balances',
      '0 8 * * *',
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
