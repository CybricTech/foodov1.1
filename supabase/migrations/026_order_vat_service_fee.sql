-- Store VAT and service fee per order for display in merchant dashboard
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS vat_kobo        BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS service_fee_kobo BIGINT NOT NULL DEFAULT 0;
