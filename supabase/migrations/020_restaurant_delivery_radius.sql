-- Add per-merchant max delivery radius to restaurants table
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS max_delivery_radius_km INTEGER;

-- NULL means "use platform default from platform_settings"
COMMENT ON COLUMN restaurants.max_delivery_radius_km IS
  'Max delivery radius in km for this restaurant. NULL = use platform default.';
