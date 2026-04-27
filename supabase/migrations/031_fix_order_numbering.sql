-- Fix generate_order_number to use first-letter-per-word prefix (matching TS utility)
-- e.g. "the-copper-pot" → "TC", "mama-put-kitchen" → "MP"
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
DECLARE
  slug_val TEXT;
  words    TEXT[];
  prefix   TEXT;
BEGIN
  SELECT slug INTO slug_val FROM restaurants WHERE id = NEW.restaurant_id;

  words := ARRAY(
    SELECT upper(w)
    FROM unnest(string_to_array(
      regexp_replace(trim(slug_val), '[-_\s]+', ' ', 'g'), ' '
    )) AS w
    WHERE length(w) > 0
  );

  IF array_length(words, 1) IS NULL OR array_length(words, 1) = 0 THEN
    prefix := 'OR';
  ELSIF array_length(words, 1) = 1 THEN
    prefix := left(words[1], 2);
  ELSE
    prefix := left(words[1], 1) || left(words[2], 1);
  END IF;

  NEW.order_number := prefix || '-' || LPAD(nextval('order_number_seq')::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add unique constraint on order_number if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_order_number_key' AND conrelid = 'orders'::regclass
  ) THEN
    ALTER TABLE orders ADD CONSTRAINT orders_order_number_key UNIQUE (order_number);
  END IF;
END $$;
