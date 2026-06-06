-- ============================================================
-- 063: Idempotent "New Rider Request" Telegram alerts
--
-- Incident (2026-06-06): the Kitchyn rider Telegram group received the same
-- "New Rider Request" multiple times for a single order — both minutes apart
-- (an order re-pushed through dispatch) and within the same second (two
-- concurrent dispatch POSTs racing). Root cause: sendTelegramRiderAlert() had
-- no idempotency. The dispatch route's "already assigned" branch deliberately
-- re-sends, and a concurrent request could read status='ready_for_pickup'
-- before the first request committed, slip past the guard, and re-alert. The
-- duplicate left NO database fingerprint (that branch writes nothing), so it
-- was invisible to both the DB and (after log retention) Vercel logs.
--
-- Fix:
--   1. orders.rider_alert_sent_at — the alert helper now claims this column
--      atomically (UPDATE ... WHERE rider_alert_sent_at IS NULL). Only the
--      first caller wins the row; concurrent or repeat calls update 0 rows and
--      skip the send. One rider request per order, race-proof.
--   2. UNIQUE index on delivery_assignments(order_id) — defense in depth so a
--      concurrent insert can never create a second assignment for one order.
--      Verified clean at migration time (157 rows / 157 distinct order_ids).
-- ============================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS rider_alert_sent_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS delivery_assignments_order_id_unique
  ON delivery_assignments (order_id);
