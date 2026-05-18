ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS closure_message TEXT NULL;
