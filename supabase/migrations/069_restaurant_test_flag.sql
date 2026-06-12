-- ============================================================
-- 067: Test-restaurant flag.
--
-- Test/demo merchants (e.g. The Copper Pot) stay fully functional —
-- storefront, checkout, test orders — but are excluded from the admin
-- Live Operations dashboard and its KPIs so platform metrics reflect
-- real business only.
-- ============================================================

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false;

UPDATE restaurants SET is_test = true WHERE slug = 'the-copper-pot';
