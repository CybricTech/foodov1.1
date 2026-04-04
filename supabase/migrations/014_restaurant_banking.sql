ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS bank_code              TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_number    TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_name      TEXT,
  ADD COLUMN IF NOT EXISTS paystack_recipient_code TEXT;  -- set after Paystack recipient creation
