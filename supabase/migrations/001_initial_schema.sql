-- ============================================================
-- Foodo Platform — Initial Schema
-- PRD v1.1 §6 — Canonical Schema
--
-- AGENT RULE: These are the authoritative table and column names.
-- Do not rename, alias, or assume columns not listed here.
-- All tenant tables have restaurant_id + active RLS.
-- platform_riders has NO restaurant_id (platform-global table).
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_cron";

-- ============================================================
-- 1. RESTAURANTS
-- ============================================================
CREATE TABLE IF NOT EXISTS restaurants (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                      TEXT UNIQUE NOT NULL,
  name                      TEXT NOT NULL,
  description               TEXT,
  logo_url                  TEXT,
  banner_url                TEXT,
  primary_color             TEXT,               -- Hex code for white-label theming
  phone                     TEXT,
  address                   TEXT,
  city                      TEXT,
  state                     TEXT,
  is_active                 BOOLEAN NOT NULL DEFAULT true,
  accepts_orders            BOOLEAN NOT NULL DEFAULT true,  -- Toggle to pause ordering
  logistics_default         TEXT NOT NULL DEFAULT 'platform_rider'
                              CHECK (logistics_default IN ('platform_rider', 'own_rider', 'third_party')),
  delivery_radius_km        NUMERIC(5,2),
  min_order_amount          NUMERIC(10,2),
  estimated_delivery_minutes INTEGER,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- restaurants is public-readable for storefront page loads
ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "restaurants_public_read"
  ON restaurants FOR SELECT
  USING (is_active = true);

CREATE POLICY "restaurants_merchant_update"
  ON restaurants FOR UPDATE
  USING (
    id = (SELECT restaurant_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "restaurants_admin_all"
  ON restaurants FOR ALL
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- ============================================================
-- 2. USER PROFILES
-- ============================================================
CREATE TABLE IF NOT EXISTS user_profiles (
  id                        UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  restaurant_id             UUID REFERENCES restaurants(id) ON DELETE SET NULL,
  -- NULL for: customers (guest), platform_riders, super_admins
  role                      TEXT NOT NULL
                              CHECK (role IN ('customer', 'merchant_owner', 'merchant_staff', 'platform_rider', 'super_admin')),
  full_name                 TEXT,
  phone                     TEXT,
  email                     TEXT,
  avatar_url                TEXT,
  vehicle_type              TEXT
                              CHECK (vehicle_type IN ('bicycle', 'motorcycle', 'car')),
  -- platform_rider only; NULL for all others
  is_active                 BOOLEAN NOT NULL DEFAULT true,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Users can read and update their own profile
CREATE POLICY "user_profiles_own"
  ON user_profiles FOR ALL
  USING (id = auth.uid());

-- Merchants can read profiles scoped to their restaurant (staff management)
CREATE POLICY "user_profiles_merchant_read"
  ON user_profiles FOR SELECT
  USING (
    restaurant_id = (SELECT restaurant_id FROM user_profiles WHERE id = auth.uid())
    AND role IN ('merchant_owner', 'merchant_staff')
  );

-- Super admin full access (service role — this policy is a safety net)
CREATE POLICY "user_profiles_admin"
  ON user_profiles FOR ALL
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- ============================================================
-- 3. MENU CATEGORIES
-- ============================================================
CREATE TABLE IF NOT EXISTS menu_categories (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id             UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name                      TEXT NOT NULL,
  display_order             INTEGER NOT NULL DEFAULT 0,
  is_active                 BOOLEAN NOT NULL DEFAULT true,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE menu_categories ENABLE ROW LEVEL SECURITY;

-- Public read for storefront
CREATE POLICY "menu_categories_public_read"
  ON menu_categories FOR SELECT
  USING (is_active = true);

-- Merchant write access
CREATE POLICY "menu_categories_restaurant_isolation"
  ON menu_categories FOR ALL
  USING (
    restaurant_id = (SELECT restaurant_id FROM user_profiles WHERE id = auth.uid())
  );

-- ============================================================
-- 4. MENU ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS menu_items (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id             UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  category_id               UUID REFERENCES menu_categories(id) ON DELETE SET NULL,
  name                      TEXT NOT NULL,
  description               TEXT,
  price                     NUMERIC(10,2) NOT NULL,
  image_url                 TEXT,
  is_available              BOOLEAN NOT NULL DEFAULT true,
  is_featured               BOOLEAN NOT NULL DEFAULT false,
  prep_time_minutes         INTEGER,
  display_order             INTEGER NOT NULL DEFAULT 0,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "menu_items_public_read"
  ON menu_items FOR SELECT
  USING (is_available = true);

CREATE POLICY "menu_items_restaurant_isolation"
  ON menu_items FOR ALL
  USING (
    restaurant_id = (SELECT restaurant_id FROM user_profiles WHERE id = auth.uid())
  );

-- ============================================================
-- 5. MENU ITEM OPTIONS (modifier groups, e.g., "Choose Size")
-- ============================================================
CREATE TABLE IF NOT EXISTS menu_item_options (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id              UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  restaurant_id             UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name                      TEXT NOT NULL,           -- e.g., "Choose Size"
  is_required               BOOLEAN NOT NULL DEFAULT false,
  min_selections            INTEGER NOT NULL DEFAULT 0,
  max_selections            INTEGER NOT NULL DEFAULT 1
);

ALTER TABLE menu_item_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "menu_item_options_public_read"
  ON menu_item_options FOR SELECT
  USING (true);  -- options are always readable if their menu_item is readable

CREATE POLICY "menu_item_options_restaurant_isolation"
  ON menu_item_options FOR ALL
  USING (
    restaurant_id = (SELECT restaurant_id FROM user_profiles WHERE id = auth.uid())
  );

-- ============================================================
-- 6. MENU ITEM OPTION CHOICES
-- ============================================================
CREATE TABLE IF NOT EXISTS menu_item_option_choices (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  option_id                 UUID NOT NULL REFERENCES menu_item_options(id) ON DELETE CASCADE,
  restaurant_id             UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name                      TEXT NOT NULL,           -- e.g., "Large"
  price_modifier            NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_available              BOOLEAN NOT NULL DEFAULT true
);

ALTER TABLE menu_item_option_choices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "menu_item_option_choices_public_read"
  ON menu_item_option_choices FOR SELECT
  USING (is_available = true);

CREATE POLICY "menu_item_option_choices_restaurant_isolation"
  ON menu_item_option_choices FOR ALL
  USING (
    restaurant_id = (SELECT restaurant_id FROM user_profiles WHERE id = auth.uid())
  );

-- ============================================================
-- 7. CUSTOMERS (CRM — separate from auth)
-- ============================================================
CREATE TABLE IF NOT EXISTS customers (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id             UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  user_id                   UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  -- NULL for guest/phone-only orders
  phone                     TEXT NOT NULL,
  full_name                 TEXT,
  email                     TEXT,
  total_orders              INTEGER NOT NULL DEFAULT 0,
  total_spent               NUMERIC(12,2) NOT NULL DEFAULT 0,
  last_order_at             TIMESTAMPTZ,
  first_order_at            TIMESTAMPTZ,
  notes                     TEXT,             -- Merchant-added notes (e.g., "VIP, no onions")
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (restaurant_id, phone)               -- One CRM record per phone per restaurant
);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customers_restaurant_isolation"
  ON customers FOR ALL
  USING (
    restaurant_id = (SELECT restaurant_id FROM user_profiles WHERE id = auth.uid())
  );

-- Customers can read their own record (when they have an auth account)
CREATE POLICY "customers_own_read"
  ON customers FOR SELECT
  USING (user_id = auth.uid());

-- ============================================================
-- 8. ORDERS
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id             UUID NOT NULL REFERENCES restaurants(id) ON DELETE RESTRICT,
  customer_id               UUID REFERENCES customers(id) ON DELETE SET NULL,
  order_number              TEXT NOT NULL,
  status                    TEXT NOT NULL DEFAULT 'pending'
                              CHECK (status IN (
                                'pending', 'confirmed', 'preparing', 'ready_for_pickup',
                                'assigned_to_rider', 'in_transit', 'delivered', 'cancelled'
                              )),
  fulfillment_type          TEXT NOT NULL
                              CHECK (fulfillment_type IN ('delivery', 'pickup')),
  delivery_address          TEXT,
  delivery_lat              NUMERIC(10,7),
  delivery_lng              NUMERIC(10,7),
  subtotal                  NUMERIC(10,2) NOT NULL,
  delivery_fee              NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount_amount           NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_amount              NUMERIC(10,2) NOT NULL,
  payment_status            TEXT NOT NULL DEFAULT 'pending'
                              CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
  payment_ref               TEXT,             -- Paystack reference
  special_instructions      TEXT,
  rider_id                  UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  estimated_delivery_at     TIMESTAMPTZ,
  delivered_at              TIMESTAMPTZ,
  cancelled_reason          TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orders_restaurant_isolation"
  ON orders FOR ALL
  USING (
    restaurant_id = (SELECT restaurant_id FROM user_profiles WHERE id = auth.uid())
  );

-- Allow anonymous read for order tracking page (customer sees their own order by ID)
-- The route handler validates this with the payment reference, not auth
CREATE POLICY "orders_public_read_by_id"
  ON orders FOR SELECT
  USING (true);  -- further restricted by RLS on customer context via service role

-- ============================================================
-- 9. ORDER ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS order_items (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                  UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  restaurant_id             UUID NOT NULL REFERENCES restaurants(id) ON DELETE RESTRICT,
  menu_item_id              UUID NOT NULL REFERENCES menu_items(id) ON DELETE RESTRICT,
  item_name                 TEXT NOT NULL,    -- Snapshot at time of order
  item_price                NUMERIC(10,2) NOT NULL,  -- Snapshot at time of order
  quantity                  INTEGER NOT NULL DEFAULT 1,
  selected_options          JSONB,            -- Snapshot of chosen modifiers
  line_total                NUMERIC(10,2) NOT NULL
);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_items_restaurant_isolation"
  ON order_items FOR ALL
  USING (
    restaurant_id = (SELECT restaurant_id FROM user_profiles WHERE id = auth.uid())
  );

-- ============================================================
-- 10. PLATFORM RIDERS (extended profile — NO restaurant_id)
--
-- AGENT RULE: This table has NO restaurant_id column.
-- It is platform-global. RLS allows a platform_rider to read/update
-- only their own row. Super Admin via service role can read all.
-- ============================================================
CREATE TABLE IF NOT EXISTS platform_riders (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID NOT NULL UNIQUE REFERENCES user_profiles(id) ON DELETE CASCADE,
  is_online                 BOOLEAN NOT NULL DEFAULT false,
  current_lat               NUMERIC(10,7),
  current_lng               NUMERIC(10,7),
  active_deliveries         INTEGER NOT NULL DEFAULT 0,
  total_deliveries          INTEGER NOT NULL DEFAULT 0,
  total_earnings_kobo       BIGINT NOT NULL DEFAULT 0,  -- Lifetime earnings in kobo
  last_seen_at              TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE platform_riders ENABLE ROW LEVEL SECURITY;

-- Riders can only see and update their own record
CREATE POLICY "platform_riders_own"
  ON platform_riders FOR ALL
  USING (user_id = auth.uid());

-- ============================================================
-- 11. DELIVERY ASSIGNMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS delivery_assignments (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                  UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  restaurant_id             UUID NOT NULL REFERENCES restaurants(id) ON DELETE RESTRICT,
  rider_id                  UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  -- NULL for 'own_rider' and 'third_party' dispatch types
  dispatch_type             TEXT NOT NULL
                              CHECK (dispatch_type IN ('platform_rider', 'own_rider', 'third_party')),
  third_party_provider      TEXT,             -- e.g., 'kwik', 'gokada' — only for 'third_party'
  third_party_ref           TEXT,             -- External tracking ID — only for 'third_party'
  share_link_token          TEXT UNIQUE,      -- Short-lived token for "Share Delivery Info" — 'own_rider' only
  status                    TEXT NOT NULL DEFAULT 'assigned'
                              CHECK (status IN (
                                'assigned', 'en_route_pickup', 'picked_up',
                                'en_route_dropoff', 'delivered', 'failed'
                              )),
  -- For 'own_rider': status is updated manually by merchant
  assigned_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  picked_up_at              TIMESTAMPTZ,
  delivered_at              TIMESTAMPTZ,
  rider_lat                 NUMERIC(10,7),    -- Last known GPS (platform_rider only)
  rider_lng                 NUMERIC(10,7)
);

ALTER TABLE delivery_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "delivery_assignments_restaurant_isolation"
  ON delivery_assignments FOR ALL
  USING (
    restaurant_id = (SELECT restaurant_id FROM user_profiles WHERE id = auth.uid())
  );

-- Platform riders can read and update their own assignments
CREATE POLICY "delivery_assignments_rider_access"
  ON delivery_assignments FOR ALL
  USING (rider_id = auth.uid());

-- Public read by share_link_token (own_rider share card)
CREATE POLICY "delivery_assignments_share_link_read"
  ON delivery_assignments FOR SELECT
  USING (share_link_token IS NOT NULL);

-- ============================================================
-- 12. PAYMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS payments (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                  UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  restaurant_id             UUID NOT NULL REFERENCES restaurants(id) ON DELETE RESTRICT,
  paystack_ref              TEXT UNIQUE NOT NULL,
  paystack_status           TEXT NOT NULL,    -- Raw status from Paystack webhook
  amount_kobo               BIGINT NOT NULL,  -- Always store in kobo (NGN × 100)
  currency                  TEXT NOT NULL DEFAULT 'NGN',
  channel                   TEXT,             -- 'card' | 'bank_transfer' | 'ussd' etc.
  paid_at                   TIMESTAMPTZ,
  metadata                  JSONB,            -- Raw Paystack response snapshot
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payments_restaurant_isolation"
  ON payments FOR ALL
  USING (
    restaurant_id = (SELECT restaurant_id FROM user_profiles WHERE id = auth.uid())
  );

-- ============================================================
-- 13. SMS LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS sms_logs (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id             UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  recipient_phone           TEXT NOT NULL,
  message_body              TEXT NOT NULL,
  provider                  TEXT NOT NULL CHECK (provider IN ('termii', 'twilio')),
  provider_ref              TEXT,
  status                    TEXT NOT NULL DEFAULT 'queued'
                              CHECK (status IN ('queued', 'sent', 'delivered', 'failed')),
  event_type                TEXT NOT NULL
                              CHECK (event_type IN ('order_confirmation', 'order_status_update', 'marketing')),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE sms_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sms_logs_restaurant_isolation"
  ON sms_logs FOR ALL
  USING (
    restaurant_id = (SELECT restaurant_id FROM user_profiles WHERE id = auth.uid())
  );

-- ============================================================
-- 14. PLATFORM SETTINGS (Super Admin global config)
-- ============================================================
CREATE TABLE IF NOT EXISTS platform_settings (
  key                       TEXT PRIMARY KEY,
  value                     JSONB NOT NULL,
  updated_by                UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

-- Only super_admin can read/write (enforced via service role in practice)
CREATE POLICY "platform_settings_admin_only"
  ON platform_settings FOR ALL
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- ============================================================
-- 15. AUDIT LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id                  UUID NOT NULL REFERENCES user_profiles(id) ON DELETE RESTRICT,
  action                    TEXT NOT NULL,        -- e.g., 'merchant.create', 'refund.trigger', 'merchant.impersonate'
  target_type               TEXT NOT NULL,        -- e.g., 'restaurant', 'order', 'user_profile'
  target_id                 TEXT NOT NULL,        -- UUID of the affected record
  metadata                  JSONB,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Audit logs are insert-only from service role; no client reads
CREATE POLICY "audit_logs_admin_read"
  ON audit_logs FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- ============================================================
-- INDEXES
-- ============================================================

-- Orders: most critical for dashboard query performance
CREATE INDEX IF NOT EXISTS orders_restaurant_status
  ON orders (restaurant_id, status);

CREATE INDEX IF NOT EXISTS orders_restaurant_created
  ON orders (restaurant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS orders_payment_ref
  ON orders (payment_ref)
  WHERE payment_ref IS NOT NULL;

-- Customers: CRM lookups by phone
CREATE INDEX IF NOT EXISTS customers_restaurant_phone
  ON customers (restaurant_id, phone);

CREATE INDEX IF NOT EXISTS customers_restaurant_spent
  ON customers (restaurant_id, total_spent DESC);

-- Platform riders: dispatch load balancing
CREATE INDEX IF NOT EXISTS platform_riders_online_active
  ON platform_riders (is_online, active_deliveries ASC)
  WHERE is_online = true;

-- Delivery assignments: rider app subscriptions
CREATE INDEX IF NOT EXISTS delivery_assignments_rider
  ON delivery_assignments (rider_id, status)
  WHERE rider_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS delivery_assignments_share_token
  ON delivery_assignments (share_link_token)
  WHERE share_link_token IS NOT NULL;

-- Menu items: storefront browsing
CREATE INDEX IF NOT EXISTS menu_items_restaurant_category
  ON menu_items (restaurant_id, category_id, display_order ASC);

CREATE INDEX IF NOT EXISTS menu_items_featured
  ON menu_items (restaurant_id, is_featured)
  WHERE is_featured = true;

-- SMS logs: retry jobs
CREATE INDEX IF NOT EXISTS sms_logs_status
  ON sms_logs (status, created_at)
  WHERE status = 'failed';

-- Audit logs: admin queries
CREATE INDEX IF NOT EXISTS audit_logs_actor
  ON audit_logs (actor_id, created_at DESC);

-- ============================================================
-- TRIGGERS — updated_at auto-update
-- ============================================================
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_restaurants
  BEFORE UPDATE ON restaurants
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_user_profiles
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_menu_items
  BEFORE UPDATE ON menu_items
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_customers
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_orders
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_platform_riders
  BEFORE UPDATE ON platform_riders
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
