-- ============================================================================
-- 082: Automated merchant payouts (Paystack Transfers)
-- ============================================================================
-- Replaces the MANUAL settlement step (a human recording a bank transfer) with
-- a cron-driven engine that runs Paystack Transfers to each merchant's verified
-- recipient. NOTHING about the money math changes: the canonical net formula
-- (@foodo/utils computeOrderNet / foodo_order_net_kobo, migrations 059/080), the
-- wallet ledger, the recompute-from-source-of-truth model, and the
-- transfer.success/failed webhook reconciliation all stay exactly as they are.
--
-- This migration only adds the *switches and guards* the engine needs:
--   1. Global master switch + shadow mode on platform_settings.
--   2. Per-merchant opt-in flag on restaurants.
--   3. A DB-level guard making a duplicate automated payout impossible.
--   4. The daily cron that pings the settle-payouts edge function.
--
-- Rollout is deliberately fail-safe: auto_payout_enabled defaults to FALSE and
-- auto_payout_shadow defaults to TRUE, so even after this ships the engine does
-- nothing until a human flips the master switch, and the FIRST thing it does
-- when switched on is log-only (shadow) — no real transfer until shadow is off.
-- ============================================================================

-- ── 1. Platform-wide controls ───────────────────────────────────────────────
ALTER TABLE platform_settings
  -- Master switch. While FALSE the cron is a no-op. Turn on only after the
  -- Paystack account prerequisites (registered business, OTP-off, controlled
  -- settlement schedule) are confirmed.
  ADD COLUMN IF NOT EXISTS auto_payout_enabled BOOLEAN NOT NULL DEFAULT false,
  -- Shadow mode. While TRUE the engine computes + logs exactly what it WOULD
  -- transfer but creates no settlements and moves no money. Flip to FALSE only
  -- after the shadow log has been reconciled against manual expectations.
  ADD COLUMN IF NOT EXISTS auto_payout_shadow BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN platform_settings.auto_payout_enabled IS
  'Master switch for automated Paystack payouts. FALSE = cron no-op.';
COMMENT ON COLUMN platform_settings.auto_payout_shadow IS
  'When TRUE the payout cron logs what it would pay but moves no money.';

-- ── 2. Per-merchant opt-in ──────────────────────────────────────────────────
-- A merchant is only auto-paid once explicitly enabled AND once they have a
-- Paystack transfer recipient (paystack_recipient_code, added in migration 014).
-- This lets us ramp one merchant at a time; everyone else stays on manual.
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS auto_payout_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN restaurants.auto_payout_enabled IS
  'Opt-in to automated Paystack payouts. Requires paystack_recipient_code set.';

-- ── 3. Duplicate-payout guard (defence in depth) ────────────────────────────
-- The engine also guards in code, but this makes a second automated settlement
-- for the same merchant + day STRUCTURALLY impossible even under a cron
-- double-fire or a concurrent run. Failed attempts are excluded so a retry on a
-- later day can re-settle the same orders. NULLs (legacy automatic rows with no
-- period_date) are treated as distinct by the partial index, so no collision.
CREATE UNIQUE INDEX IF NOT EXISTS settlements_automated_period_uniq
  ON settlements (restaurant_id, period_date)
  WHERE settlement_type = 'automatic' AND status <> 'failed';

-- Fast lookup of payout-eligible merchants.
CREATE INDEX IF NOT EXISTS restaurants_auto_payout_idx
  ON restaurants (id)
  WHERE auto_payout_enabled = true AND paystack_recipient_code IS NOT NULL;

-- ── 4. Daily payout cron ────────────────────────────────────────────────────
-- Mirrors the reconcile-pending-payments pattern (migration 081): pg_cron pings
-- a thin edge function, which forwards to the Next.js engine route where all the
-- money logic + the canonical @foodo/utils formula live. Runs once daily at
-- 02:00 UTC (03:00 WAT) — orders are only settled once their per-order hold
-- window has elapsed, enforced inside the engine, not by the schedule.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('settle-payouts');
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    PERFORM cron.schedule(
      'settle-payouts',
      '0 2 * * *',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.supabase_url') || '/functions/v1/settle-payouts',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.service_role_key')
        ),
        body := '{}'::jsonb
      );
      $cron$
    );

    RAISE NOTICE 'settle-payouts cron scheduled (daily 02:00 UTC)';
  ELSE
    RAISE NOTICE 'pg_cron not enabled — skipping settle-payouts schedule';
  END IF;
END $$;
