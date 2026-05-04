-- Per-restaurant delivery pricing overrides.
-- NULL means "use the platform default from platform_settings".
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS restaurant_base_fee_kobo     BIGINT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS restaurant_per_km_rate_kobo  BIGINT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS restaurant_max_fee_kobo      BIGINT DEFAULT NULL;
