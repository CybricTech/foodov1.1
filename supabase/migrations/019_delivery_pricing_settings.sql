-- Add delivery pricing config to the singleton platform_settings table
ALTER TABLE platform_settings
  ADD COLUMN IF NOT EXISTS delivery_base_fee_kobo    BIGINT NOT NULL DEFAULT 230000,
  ADD COLUMN IF NOT EXISTS delivery_per_km_rate_kobo BIGINT NOT NULL DEFAULT 15000,
  ADD COLUMN IF NOT EXISTS delivery_max_radius_km    INTEGER NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS delivery_max_fee_kobo     BIGINT NOT NULL DEFAULT 1500000;

-- Seed the existing singleton row (WHERE clause guards against re-runs)
UPDATE platform_settings SET
  delivery_base_fee_kobo    = 230000,
  delivery_per_km_rate_kobo = 15000,
  delivery_max_radius_km    = 25,
  delivery_max_fee_kobo     = 1500000
WHERE delivery_base_fee_kobo IS NULL OR delivery_base_fee_kobo = 0;
