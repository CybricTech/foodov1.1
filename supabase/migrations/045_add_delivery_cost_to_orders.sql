-- 045: Track outbound delivery cost (what the platform pays the rider)
-- Captured by an admin when marking a platform-rider order as delivered, so we
-- can later reconcile delivery margin (delivery_fee_kobo charged to customer
-- minus delivery_cost_kobo paid to rider).
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_cost_kobo INTEGER
    CHECK (delivery_cost_kobo IS NULL OR delivery_cost_kobo >= 0);
