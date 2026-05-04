-- Fix wallet settlement flow for manual payout model.
-- In this model: orders → pending → admin manually transfers → records settlement.
-- Money never needs an "available" intermediate stage; it goes pending → settled.

-- 1. Add merchant_charge to the wallet_transactions type constraint
--    (the webhook was inserting this type but the constraint blocked it)
ALTER TABLE wallet_transactions
  DROP CONSTRAINT IF EXISTS wallet_transactions_type_check;

ALTER TABLE wallet_transactions
  ADD CONSTRAINT wallet_transactions_type_check
  CHECK (type IN (
    'order_credit',
    'service_charge',
    'logistics_fee',
    'merchant_charge',
    'settlement_debit',
    'manual_adjustment'
  ));

-- 2. Fix debit_wallet_for_settlement to decrement pending_balance_kobo
--    (previously decremented available_balance_kobo which was always 0,
--     causing the function to hit the CHECK constraint or go negative)
CREATE OR REPLACE FUNCTION debit_wallet_for_settlement(
  p_restaurant_id UUID,
  p_amount_kobo   BIGINT
)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE restaurant_wallets
  SET
    pending_balance_kobo = GREATEST(pending_balance_kobo - p_amount_kobo, 0),
    total_withdrawn_kobo = total_withdrawn_kobo + p_amount_kobo,
    updated_at           = now()
  WHERE restaurant_id = p_restaurant_id;
END;
$$;

-- 3. Fix restore_failed_settlement to restore pending_balance_kobo
--    (symmetric fix — if a settlement fails, restore the pending balance)
CREATE OR REPLACE FUNCTION restore_failed_settlement(
  p_restaurant_id UUID,
  p_amount_kobo   BIGINT
)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE restaurant_wallets
  SET
    pending_balance_kobo = pending_balance_kobo + p_amount_kobo,
    total_withdrawn_kobo = GREATEST(total_withdrawn_kobo - p_amount_kobo, 0),
    updated_at           = now()
  WHERE restaurant_id = p_restaurant_id;
END;
$$;
