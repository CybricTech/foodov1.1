-- 047: Allow NULL paystack_ref for Monnify payments
-- paystack_ref was NOT NULL because every payment previously went through
-- Paystack. Now that Monnify payments don't carry a paystack_ref, drop the
-- constraint. Existing rows are unaffected.
ALTER TABLE payments ALTER COLUMN paystack_ref DROP NOT NULL;
