-- Reconcile wallet state with reality.
-- Two issues caused drift between admin settlement view and merchant wallet view:
--   1. order_credit wallet_transactions never got status flipped from 'pending'
--      to 'settled' when their parent order was settled. Activity tab badges lie.
--   2. restaurant_wallets cached counters drifted because the old broken
--      debit_wallet_for_settlement either silently failed or hit the
--      available_balance check constraint.

-- 1. Mark order_credit txns as 'settled' when their order is linked to a settlement
UPDATE wallet_transactions wt
SET status = 'settled'
FROM orders o
WHERE wt.order_id = o.id
  AND o.settlement_id IS NOT NULL
  AND wt.type = 'order_credit'
  AND wt.status IN ('pending', 'available');

-- 2. Recompute restaurant_wallets cached counters from sources of truth
--    - total_earned_kobo  = sum of all order_credit txns
--    - pending_balance    = sum of order_credit txns whose order is unsettled
--    - total_withdrawn    = sum of paid settlements (matches admin view)
--    - available_balance  = 0 (manual payout model has no available stage)
UPDATE restaurant_wallets w
SET
  total_earned_kobo = COALESCE((
    SELECT SUM(amount_kobo)
    FROM wallet_transactions
    WHERE restaurant_id = w.restaurant_id
      AND type = 'order_credit'
  ), 0),
  pending_balance_kobo = COALESCE((
    SELECT SUM(wt.amount_kobo)
    FROM wallet_transactions wt
    LEFT JOIN orders o ON o.id = wt.order_id
    WHERE wt.restaurant_id = w.restaurant_id
      AND wt.type = 'order_credit'
      AND (o.settlement_id IS NULL OR wt.order_id IS NULL)
  ), 0),
  total_withdrawn_kobo = COALESCE((
    SELECT SUM(amount_kobo)
    FROM settlements
    WHERE restaurant_id = w.restaurant_id
      AND status = 'paid'
  ), 0),
  available_balance_kobo = 0,
  updated_at = now();
