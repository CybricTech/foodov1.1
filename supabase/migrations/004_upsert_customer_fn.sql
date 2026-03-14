-- ============================================================
-- upsert_customer RPC function
-- Called by the Paystack webhook after successful payment.
-- Atomically creates or updates the CRM customer record.
-- ============================================================

CREATE OR REPLACE FUNCTION upsert_customer(
  p_restaurant_id  UUID,
  p_phone          TEXT,
  p_full_name      TEXT,
  p_email          TEXT DEFAULT NULL,
  p_order_total_kobo BIGINT DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO customers (
    restaurant_id,
    phone,
    full_name,
    email,
    first_order_at,
    last_order_at,
    total_orders,
    total_spent_kobo
  )
  VALUES (
    p_restaurant_id,
    p_phone,
    p_full_name,
    p_email,
    now(),
    now(),
    1,
    p_order_total_kobo
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

-- Grant execute to service role only (called from Edge Functions with service key)
REVOKE EXECUTE ON FUNCTION upsert_customer FROM PUBLIC;
GRANT EXECUTE ON FUNCTION upsert_customer TO service_role;
