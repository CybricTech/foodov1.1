-- ============================================================
-- Schema alignment migration.
-- Reconciles column names between the initial schema (NGN NUMERIC)
-- and the application code (kobo BIGINT) by adding the kobo
-- columns the application expects, plus any missing columns.
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- orders: add kobo columns + missing fields
-- ──────────────────────────────────────────────────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS customer_name         TEXT,
  ADD COLUMN IF NOT EXISTS customer_phone        TEXT,
  ADD COLUMN IF NOT EXISTS customer_email        TEXT,
  ADD COLUMN IF NOT EXISTS payment_id            UUID REFERENCES payments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS subtotal_kobo         BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_fee_kobo     BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_kobo            BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancellation_reason   TEXT;

-- Back-fill kobo columns from existing NGN columns (multiply × 100)
UPDATE orders
SET
  subtotal_kobo       = ROUND(subtotal * 100),
  delivery_fee_kobo   = ROUND(delivery_fee * 100),
  total_kobo          = ROUND(total_amount * 100);

-- ──────────────────────────────────────────────────────────
-- order_items: add kobo columns
-- ──────────────────────────────────────────────────────────
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS item_price_kobo   BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS line_total_kobo   BIGINT NOT NULL DEFAULT 0;

UPDATE order_items
SET
  item_price_kobo = ROUND(item_price * 100),
  line_total_kobo = ROUND(line_total * 100);

-- ──────────────────────────────────────────────────────────
-- customers: add total_spent_kobo
-- ──────────────────────────────────────────────────────────
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS total_spent_kobo  BIGINT NOT NULL DEFAULT 0;

UPDATE customers
SET total_spent_kobo = ROUND(total_spent * 100);

-- ──────────────────────────────────────────────────────────
-- platform_riders: add expo_push_token + is_active
-- ──────────────────────────────────────────────────────────
ALTER TABLE platform_riders
  ADD COLUMN IF NOT EXISTS expo_push_token   TEXT,
  ADD COLUMN IF NOT EXISTS is_active         BOOLEAN NOT NULL DEFAULT true;

-- ──────────────────────────────────────────────────────────
-- restaurants: ensure delivery_fee column exists in kobo
-- ──────────────────────────────────────────────────────────
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS delivery_fee  BIGINT NOT NULL DEFAULT 0;

-- Update existing NUMERIC delivery_fee_ngn to kobo (if it was stored differently)
-- (the original column is delivery_fee NUMERIC — rename it to preserve data,
--  add the BIGINT version for the app)
-- If column already exists as NUMERIC:
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'restaurants'
      AND column_name = 'delivery_fee'
      AND data_type = 'numeric'
  ) THEN
    -- Column exists as NUMERIC — add kobo version
    ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS delivery_fee_kobo BIGINT NOT NULL DEFAULT 0;
    UPDATE restaurants SET delivery_fee_kobo = ROUND(delivery_fee * 100);
    ALTER TABLE restaurants DROP COLUMN delivery_fee;
    ALTER TABLE restaurants RENAME COLUMN delivery_fee_kobo TO delivery_fee;
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────
-- payments: ensure order_id FK exists
-- ──────────────────────────────────────────────────────────
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS order_id   UUID REFERENCES orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS paid_at    TIMESTAMPTZ;

-- ──────────────────────────────────────────────────────────
-- Update the upsert_customer function to use kobo column
-- ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION upsert_customer(
  p_restaurant_id      UUID,
  p_phone              TEXT,
  p_full_name          TEXT,
  p_email              TEXT DEFAULT NULL,
  p_order_total_kobo   BIGINT DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO customers (
    restaurant_id, phone, full_name, email,
    first_order_at, last_order_at, total_orders, total_spent_kobo
  )
  VALUES (
    p_restaurant_id, p_phone, p_full_name, p_email,
    now(), now(), 1, p_order_total_kobo
  )
  ON CONFLICT (restaurant_id, phone) DO UPDATE SET
    full_name        = EXCLUDED.full_name,
    email            = COALESCE(EXCLUDED.email, customers.email),
    last_order_at    = now(),
    total_orders     = customers.total_orders + 1,
    total_spent_kobo = customers.total_spent_kobo + EXCLUDED.total_spent_kobo,
    updated_at       = now();
END;
$$;

REVOKE EXECUTE ON FUNCTION upsert_customer FROM PUBLIC;
GRANT EXECUTE ON FUNCTION upsert_customer TO service_role;

-- ──────────────────────────────────────────────────────────
-- menu_categories: add description
-- ──────────────────────────────────────────────────────────
ALTER TABLE menu_categories
  ADD COLUMN IF NOT EXISTS description  TEXT;

-- ──────────────────────────────────────────────────────────
-- menu_items: add price_kobo
-- ──────────────────────────────────────────────────────────
ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS price_kobo  BIGINT NOT NULL DEFAULT 0;

UPDATE menu_items SET price_kobo = ROUND(price * 100);

-- ──────────────────────────────────────────────────────────
-- menu_item_option_choices: add price_modifier_kobo
-- ──────────────────────────────────────────────────────────
ALTER TABLE menu_item_option_choices
  ADD COLUMN IF NOT EXISTS price_modifier_kobo  BIGINT NOT NULL DEFAULT 0;

UPDATE menu_item_option_choices SET price_modifier_kobo = ROUND(price_modifier * 100);

-- ──────────────────────────────────────────────────────────
-- sms_logs: align column names with app code
-- ──────────────────────────────────────────────────────────
ALTER TABLE sms_logs
  ADD COLUMN IF NOT EXISTS order_id   UUID REFERENCES orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS phone      TEXT,
  ADD COLUMN IF NOT EXISTS message    TEXT,
  ADD COLUMN IF NOT EXISTS sent_at    TIMESTAMPTZ;

UPDATE sms_logs
SET
  phone   = COALESCE(phone, recipient_phone),
  message = COALESCE(message, message_body);

-- ──────────────────────────────────────────────────────────
-- Sequence for order_number
-- ──────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1000;

CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
DECLARE
  prefix TEXT;
BEGIN
  SELECT UPPER(LEFT(REPLACE(slug, '-', ''), 2))
  INTO prefix
  FROM restaurants
  WHERE id = NEW.restaurant_id;

  NEW.order_number := prefix || '-' || LPAD(nextval('order_number_seq')::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_order_number ON orders;
CREATE TRIGGER set_order_number
  BEFORE INSERT ON orders
  FOR EACH ROW
  WHEN (NEW.order_number IS NULL OR NEW.order_number = '')
  EXECUTE FUNCTION generate_order_number();
