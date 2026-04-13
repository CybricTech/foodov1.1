-- Add opening hours JSONB to restaurants
-- Structure: { mon: { enabled: bool, open: "HH:MM", close: "HH:MM" }, tue: ..., ... }
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS opening_hours JSONB DEFAULT NULL;
