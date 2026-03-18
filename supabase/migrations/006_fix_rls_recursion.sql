-- ============================================================
-- Fix RLS infinite recursion caused by user_profiles policies
-- querying user_profiles from within themselves.
--
-- Solution: SECURITY DEFINER helper functions in public schema
-- that bypass RLS, used in all policies that need the caller's
-- role/restaurant_id.
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- Helper functions (SECURITY DEFINER — bypass RLS)
-- ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_my_role()
  RETURNS TEXT
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT role::text FROM public.user_profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.get_my_restaurant_id()
  RETURNS UUID
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT restaurant_id FROM public.user_profiles WHERE id = auth.uid()
$$;

-- ──────────────────────────────────────────────────────────
-- Fix user_profiles policies (the circular ones)
-- ──────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "user_profiles_merchant_read" ON user_profiles;
DROP POLICY IF EXISTS "user_profiles_admin"         ON user_profiles;

CREATE POLICY "user_profiles_merchant_read"
  ON user_profiles FOR SELECT
  USING (
    restaurant_id = public.get_my_restaurant_id()
    AND role IN ('merchant_owner', 'merchant_staff')
  );

CREATE POLICY "user_profiles_admin"
  ON user_profiles FOR ALL
  USING (public.get_my_role() = 'super_admin');

-- ──────────────────────────────────────────────────────────
-- Fix restaurants policies
-- ──────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "restaurants_merchant_update" ON restaurants;
DROP POLICY IF EXISTS "restaurants_admin_all"        ON restaurants;

CREATE POLICY "restaurants_merchant_update"
  ON restaurants FOR UPDATE
  USING (id = public.get_my_restaurant_id());

CREATE POLICY "restaurants_admin_all"
  ON restaurants FOR ALL
  USING (public.get_my_role() = 'super_admin');

-- ──────────────────────────────────────────────────────────
-- Fix all tenant-table restaurant_isolation policies
-- ──────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "menu_categories_restaurant_isolation"       ON menu_categories;
DROP POLICY IF EXISTS "menu_items_restaurant_isolation"            ON menu_items;
DROP POLICY IF EXISTS "menu_item_options_restaurant_isolation"     ON menu_item_options;
DROP POLICY IF EXISTS "menu_item_option_choices_restaurant_isolation" ON menu_item_option_choices;
DROP POLICY IF EXISTS "customers_restaurant_isolation"             ON customers;
DROP POLICY IF EXISTS "orders_restaurant_isolation"                ON orders;
DROP POLICY IF EXISTS "orders_customer_read"                       ON orders;
DROP POLICY IF EXISTS "order_items_restaurant_isolation"           ON order_items;
DROP POLICY IF EXISTS "delivery_assignments_restaurant_isolation"  ON delivery_assignments;
DROP POLICY IF EXISTS "payments_restaurant_isolation"              ON payments;
DROP POLICY IF EXISTS "sms_logs_restaurant_isolation"              ON sms_logs;
DROP POLICY IF EXISTS "audit_logs_admin_only"                      ON audit_logs;
DROP POLICY IF EXISTS "platform_riders_own"                        ON platform_riders;

CREATE POLICY "menu_categories_restaurant_isolation"
  ON menu_categories FOR ALL
  USING (restaurant_id = public.get_my_restaurant_id());

CREATE POLICY "menu_items_restaurant_isolation"
  ON menu_items FOR ALL
  USING (restaurant_id = public.get_my_restaurant_id());

CREATE POLICY "menu_item_options_restaurant_isolation"
  ON menu_item_options FOR ALL
  USING (restaurant_id = public.get_my_restaurant_id());

CREATE POLICY "menu_item_option_choices_restaurant_isolation"
  ON menu_item_option_choices FOR ALL
  USING (restaurant_id = public.get_my_restaurant_id());

CREATE POLICY "customers_restaurant_isolation"
  ON customers FOR ALL
  USING (restaurant_id = public.get_my_restaurant_id());

CREATE POLICY "orders_restaurant_isolation"
  ON orders FOR ALL
  USING (restaurant_id = public.get_my_restaurant_id());

-- Storefront: any anonymous user can read a specific order (tracking page)
CREATE POLICY "orders_customer_read"
  ON orders FOR SELECT
  USING (true);

CREATE POLICY "order_items_restaurant_isolation"
  ON order_items FOR ALL
  USING (restaurant_id = public.get_my_restaurant_id());

CREATE POLICY "delivery_assignments_restaurant_isolation"
  ON delivery_assignments FOR ALL
  USING (restaurant_id = public.get_my_restaurant_id());

CREATE POLICY "payments_restaurant_isolation"
  ON payments FOR ALL
  USING (restaurant_id = public.get_my_restaurant_id());

CREATE POLICY "sms_logs_restaurant_isolation"
  ON sms_logs FOR ALL
  USING (restaurant_id = public.get_my_restaurant_id());

CREATE POLICY "audit_logs_admin_only"
  ON audit_logs FOR ALL
  USING (public.get_my_role() = 'super_admin');

CREATE POLICY "platform_riders_own"
  ON platform_riders FOR ALL
  USING (user_id = auth.uid());
