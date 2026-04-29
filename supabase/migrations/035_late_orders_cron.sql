-- ============================================================
-- 035: late_at column + pg_cron job to flag late open orders
-- - Adds late_at TIMESTAMPTZ to orders
-- - Two partial indexes for cron and admin list queries
-- - mark_late_orders() function + 1-minute cron schedule
-- - One-time backfill for already-late open orders
-- ============================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS late_at TIMESTAMPTZ;

-- For the cron's UPDATE query (finds un-flagged late orders fast)
CREATE INDEX IF NOT EXISTS orders_estimated_delivery_open
  ON orders (estimated_delivery_at)
  WHERE status NOT IN ('delivered','cancelled') AND late_at IS NULL;

-- For the admin list query
CREATE INDEX IF NOT EXISTS orders_late_open
  ON orders (late_at)
  WHERE late_at IS NOT NULL AND status NOT IN ('delivered','cancelled');

CREATE OR REPLACE FUNCTION mark_late_orders() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE orders
     SET late_at    = now(),
         updated_at = now()
   WHERE late_at IS NULL
     AND estimated_delivery_at IS NOT NULL
     AND estimated_delivery_at < now()
     AND status NOT IN ('delivered','cancelled');
END;
$$;

SELECT cron.unschedule('mark-late-orders')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mark-late-orders');

SELECT cron.schedule(
  'mark-late-orders',
  '* * * * *',
  $cron$ SELECT mark_late_orders(); $cron$
);

SELECT mark_late_orders();
