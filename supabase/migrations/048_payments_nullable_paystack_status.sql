-- 048: Allow NULL paystack_status for Monnify payments
-- Same rationale as 047: paystack_status was NOT NULL for the Paystack-only
-- era. Monnify payments track status in monnify_status instead. Dropping the
-- constraint is purely permissive — existing Paystack rows and new Paystack
-- inserts that supply paystack_status are completely unaffected.
ALTER TABLE payments ALTER COLUMN paystack_status DROP NOT NULL;
