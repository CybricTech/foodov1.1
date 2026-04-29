-- ============================================================
-- 034: Ensure menu-images bucket exists and is public
-- The bucket was created manually without the public flag,
-- causing /object/public/ URLs to return 402.
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('menu-images', 'menu-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;
