-- ============================================================================
-- 093: Hero banner focal point (mobile + desktop)
-- ============================================================================
-- The storefront hero renders restaurants.banner_url with CSS object-cover,
-- always anchored dead-center — so on the very tall mobile crop vs. the very
-- wide desktop crop, the visually important part of the photo can land off
-- to one side (reported: a hero photo appearing shifted right on mobile).
--
-- Adds a merchant-adjustable focal point (percentage anchor CSS resolves
-- object-position against), stored separately per breakpoint since the ideal
-- anchor for a tall crop and a wide crop from the same source photo often
-- differ:
--
--   banner_focal_x / banner_focal_y                — desktop anchor (0-100)
--   banner_focal_x_mobile / banner_focal_y_mobile   — mobile anchor (0-100)
--
-- All four default to 50 (dead-center), so existing restaurants render
-- identically to today until a merchant drags the focal point picker in
-- Settings.
-- ============================================================================

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS banner_focal_x        SMALLINT NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS banner_focal_y         SMALLINT NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS banner_focal_x_mobile  SMALLINT NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS banner_focal_y_mobile  SMALLINT NOT NULL DEFAULT 50;

ALTER TABLE restaurants
  ADD CONSTRAINT restaurants_banner_focal_range
  CHECK (
    banner_focal_x        BETWEEN 0 AND 100 AND
    banner_focal_y        BETWEEN 0 AND 100 AND
    banner_focal_x_mobile  BETWEEN 0 AND 100 AND
    banner_focal_y_mobile  BETWEEN 0 AND 100
  );

COMMENT ON COLUMN restaurants.banner_focal_x IS
  'Hero banner object-position X anchor (0-100%) for desktop/wide crops. '
  'Default 50 = center, matching pre-093 behavior.';
COMMENT ON COLUMN restaurants.banner_focal_y IS
  'Hero banner object-position Y anchor (0-100%) for desktop/wide crops. '
  'Default 50 = center, matching pre-093 behavior.';
COMMENT ON COLUMN restaurants.banner_focal_x_mobile IS
  'Hero banner object-position X anchor (0-100%) for the tall mobile crop. '
  'Independent of banner_focal_x since the same photo often needs a '
  'different anchor on a tall vs. wide crop. Default 50 = center.';
COMMENT ON COLUMN restaurants.banner_focal_y_mobile IS
  'Hero banner object-position Y anchor (0-100%) for the tall mobile crop. '
  'Independent of banner_focal_y since the same photo often needs a '
  'different anchor on a tall vs. wide crop. Default 50 = center.';
