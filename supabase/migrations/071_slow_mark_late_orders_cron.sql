-- ============================================================
-- 071: Slow the mark-late-orders cron from 1min -> 5min.
--
-- Follow-up to the 2026-06 CPU-budget pressure. migration 062 already
-- hardened mark_late_orders() with an advisory lock so overlapping runs
-- skip instead of piling up. Running it every minute is still more often
-- than the business needs (an order being flagged "late" within 5 minutes
-- instead of 1 is fine) and every wake-up costs CPU. This widens the
-- schedule to every 5 minutes.
--
-- cron.schedule() upserts by job name, so this also serves as the canonical
-- record of the schedule (supersedes the '* * * * *' set in migration 035).
-- ============================================================

SELECT cron.schedule(
  'mark-late-orders',
  '*/5 * * * *',
  $cron$ SELECT mark_late_orders(); $cron$
);
