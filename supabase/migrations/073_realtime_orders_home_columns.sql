-- ============================================================
-- 073: Add three more orders columns to the Realtime publication.
--
-- Audit of the merchant home/overview screens (mobile
-- home-screen.tsx HomeOrder, and the web dashboard home) showed they read
-- payment_status, customer_name, and special_instructions DIRECTLY from the
-- Realtime payload on INSERT (they store payload.new rather than refetching).
-- 072's orders column list omitted them, so a just-arrived order showed those
-- fields blank on the overview until the next refetch.
--
-- These are restored here. The genuinely large/consistent free-text field
-- (delivery_address) and the rare cancelled_reason / payment_ref remain
-- excluded — that is where the WAL-decode saving actually comes from;
-- special_instructions is a typically-short customer note.
--
-- The dedicated order-management screens (order-queue / frontline / mobile
-- orders-screen) refetch the full row on INSERT and were never affected.
-- ============================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication_tables
             WHERE pubname = 'supabase_realtime' AND tablename = 'orders') THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE orders;
  END IF;
END $$;

ALTER PUBLICATION supabase_realtime
  ADD TABLE orders (
    id, restaurant_id, order_number, status, delivery_status,
    fulfillment_type, total_kobo, total_amount, created_at, updated_at,
    late_at, rider_id, payment_status, customer_name, special_instructions
  );
