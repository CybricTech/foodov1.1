-- Allow max_selections to be NULL (means unlimited)
-- Previously was NOT NULL DEFAULT 1, which made "unlimited" impossible to save
ALTER TABLE menu_item_options
  ALTER COLUMN max_selections DROP NOT NULL,
  ALTER COLUMN max_selections SET DEFAULT NULL;
