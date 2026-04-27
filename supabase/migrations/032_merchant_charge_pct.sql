-- ============================================================
-- 032: Merchant charge percentage
-- - Adds merchant_charge_pct to platform_settings (default 1%)
--   This is deducted from merchant settlement as a percentage
--   of the total Paystack transaction amount per order.
-- - Adds merchant_charge_total_kobo to settlements to track
--   the merchant-side charge separately from the delivery commission.
-- ============================================================

ALTER TABLE platform_settings
  ADD COLUMN IF NOT EXISTS merchant_charge_pct NUMERIC(5,4) NOT NULL DEFAULT 0.01;

ALTER TABLE settlements
  ADD COLUMN IF NOT EXISTS merchant_charge_total_kobo BIGINT NOT NULL DEFAULT 0;
