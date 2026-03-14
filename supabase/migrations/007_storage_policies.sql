-- ============================================================
-- Storage RLS policies for the menu-images bucket.
-- Without these, all writes (INSERT/UPDATE/DELETE) are denied
-- even for authenticated users.
-- ============================================================

-- Public read (storefront needs to load menu images without auth)
CREATE POLICY "menu_images_public_read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'menu-images');

-- Authenticated merchants can upload to their own restaurant folder
CREATE POLICY "menu_images_merchant_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'menu-images'
    AND (storage.foldername(name))[1] = (
      SELECT restaurant_id::text
      FROM public.user_profiles
      WHERE id = auth.uid()
    )
  );

-- Authenticated merchants can update files in their own folder
CREATE POLICY "menu_images_merchant_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'menu-images'
    AND (storage.foldername(name))[1] = (
      SELECT restaurant_id::text
      FROM public.user_profiles
      WHERE id = auth.uid()
    )
  );

-- Authenticated merchants can delete files in their own folder
CREATE POLICY "menu_images_merchant_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'menu-images'
    AND (storage.foldername(name))[1] = (
      SELECT restaurant_id::text
      FROM public.user_profiles
      WHERE id = auth.uid()
    )
  );
