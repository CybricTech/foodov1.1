-- ============================================================
-- 038: Add merchant_charge to wallet_transactions type constraint
--
-- The webhook inserts type = 'merchant_charge' but the original
-- CHECK constraint in 015_wallet_system.sql did not include it,
-- causing every order to silently fail wallet accounting.
-- ============================================================

ALTER TABLE wallet_transactions
  DROP CONSTRAINT IF EXISTS wallet_transactions_type_check;

ALTER TABLE wallet_transactions
  ADD CONSTRAINT wallet_transactions_type_check
  CHECK (type IN (
    'order_credit',
    'service_charge',
    'logistics_fee',
    'settlement_debit',
    'manual_adjustment',
    'merchant_charge'
  ));
