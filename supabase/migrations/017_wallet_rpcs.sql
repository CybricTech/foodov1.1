-- Increment pending balance + total earned atomically
CREATE OR REPLACE FUNCTION increment_wallet_pending(
  p_restaurant_id UUID,
  p_amount_kobo   BIGINT
)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE restaurant_wallets
  SET
    pending_balance_kobo = pending_balance_kobo + p_amount_kobo,
    total_earned_kobo    = total_earned_kobo + p_amount_kobo,
    updated_at           = now()
  WHERE restaurant_id = p_restaurant_id;
END;
$$;

-- Move pending → available for transactions past their available_at
CREATE OR REPLACE FUNCTION release_pending_wallet_balances()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT restaurant_id, SUM(amount_kobo) AS total
    FROM wallet_transactions
    WHERE status = 'pending'
      AND available_at <= now()
    GROUP BY restaurant_id
  LOOP
    UPDATE wallet_transactions
    SET status = 'available'
    WHERE restaurant_id = r.restaurant_id
      AND status = 'pending'
      AND available_at <= now();

    UPDATE restaurant_wallets
    SET
      pending_balance_kobo   = pending_balance_kobo - r.total,
      available_balance_kobo = available_balance_kobo + r.total,
      updated_at             = now()
    WHERE restaurant_id = r.restaurant_id;
  END LOOP;
END;
$$;

-- Debit wallet when settlement is initiated
CREATE OR REPLACE FUNCTION debit_wallet_for_settlement(
  p_restaurant_id UUID,
  p_amount_kobo   BIGINT
)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE restaurant_wallets
  SET
    available_balance_kobo = available_balance_kobo - p_amount_kobo,
    total_withdrawn_kobo   = total_withdrawn_kobo + p_amount_kobo,
    updated_at             = now()
  WHERE restaurant_id = p_restaurant_id;
END;
$$;

-- Restore available balance if a transfer fails
CREATE OR REPLACE FUNCTION restore_failed_settlement(
  p_restaurant_id UUID,
  p_amount_kobo   BIGINT
)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE restaurant_wallets
  SET
    available_balance_kobo = available_balance_kobo + p_amount_kobo,
    total_withdrawn_kobo   = total_withdrawn_kobo - p_amount_kobo,
    updated_at             = now()
  WHERE restaurant_id = p_restaurant_id;
END;
$$;
