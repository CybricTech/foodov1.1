-- Add optional VAT percentage to restaurants.
-- NULL = no VAT charged. Non-null = percentage applied on subtotal at checkout.
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS vat_percentage NUMERIC(5,2) DEFAULT NULL;

COMMENT ON COLUMN restaurants.vat_percentage IS
  'Optional VAT rate (e.g. 7.5 for 7.5%). Applied to order subtotal at checkout. NULL = no VAT.';
