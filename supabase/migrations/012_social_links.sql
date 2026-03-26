-- Add social media link columns to restaurants table.
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS instagram_url  TEXT,
  ADD COLUMN IF NOT EXISTS facebook_url   TEXT,
  ADD COLUMN IF NOT EXISTS twitter_url    TEXT,
  ADD COLUMN IF NOT EXISTS youtube_url    TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;
