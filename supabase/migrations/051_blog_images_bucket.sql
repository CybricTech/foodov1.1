-- 051: Public storage bucket for blog cover images
--
-- Public read so the landing page can render <img src> directly without
-- signed URLs. Writes are restricted to the service role (admin uploads
-- go through /api/admin/landing/blog routes).

INSERT INTO storage.buckets (id, name, public)
VALUES ('blog-images', 'blog-images', true)
ON CONFLICT (id) DO NOTHING;

-- Public read: anyone can fetch cover images
DROP POLICY IF EXISTS blog_images_public_read ON storage.objects;
CREATE POLICY blog_images_public_read ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'blog-images');

-- No public write/update/delete; service role bypasses RLS so admin
-- routes can upload. No explicit policy needed for writes — default deny.
