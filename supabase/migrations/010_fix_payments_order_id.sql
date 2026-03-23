-- Fix payments.order_id NOT NULL constraint.
--
-- The checkout flow inserts a payment record BEFORE the order exists
-- (order is created by the Paystack webhook after payment is confirmed).
-- Migration 001 incorrectly set order_id as NOT NULL; migration 005 tried
-- to fix it with ADD COLUMN IF NOT EXISTS but that's a no-op when the
-- column already exists.
ALTER TABLE payments ALTER COLUMN order_id DROP NOT NULL;
