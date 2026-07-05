-- ============================================================
-- 086 — Add-ons as menu items + linked option choices
-- ============================================================
-- Lets a merchant reuse menu items as option-group choices ("add-ons").
--
--   • menu_items.is_addon_only  — item is hidden from the storefront grid and
--     exists only to be offered as a choice (e.g. "Extra cheese", a flavour).
--   • menu_categories.is_addon_group — flags the reserved "Add-ons" category
--     that houses add-on items in the dashboard (so they stay manageable).
--   • menu_item_option_choices.linked_item_id — a choice can point at an add-on
--     item and mirror its NAME + AVAILABILITY. Price stays independent
--     (price_modifier_kobo), so an add-on can be free in one bundle and an
--     upcharge in another.
--
-- Toggling an add-on item off (or renaming it) propagates to every choice that
-- links to it. Deleting the add-on nulls the link but keeps the choice's
-- last-known name, so existing bundles — and order history — never break.
--
-- Fully idempotent (IF NOT EXISTS / CREATE OR REPLACE / DROP IF EXISTS) so it is
-- safe to re-run via `supabase db push` after being applied out-of-band.

-- ── 1. Columns ────────────────────────────────────────────────────────────────
ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS is_addon_only BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE menu_categories
  ADD COLUMN IF NOT EXISTS is_addon_group BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE menu_item_option_choices
  ADD COLUMN IF NOT EXISTS linked_item_id UUID
    REFERENCES menu_items(id) ON DELETE SET NULL;

-- ── 2. Indexes ────────────────────────────────────────────────────────────────
-- Lookup choices by their source item (used by the propagation trigger).
CREATE INDEX IF NOT EXISTS menu_item_option_choices_linked_item
  ON menu_item_option_choices (linked_item_id)
  WHERE linked_item_id IS NOT NULL;

-- Storefront filters add-on items out; the dashboard lists them. Both filter on
-- (restaurant_id, is_addon_only).
CREATE INDEX IF NOT EXISTS menu_items_restaurant_addon
  ON menu_items (restaurant_id, is_addon_only);

-- ── 3. Write-time sync: a linked choice always mirrors its source item ─────────
-- On insert/relink, pull name + availability from the linked item so the link is
-- authoritative regardless of what the client sends. SECURITY DEFINER so the read
-- never trips RLS.
CREATE OR REPLACE FUNCTION sync_linked_choice_from_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.linked_item_id IS NOT NULL THEN
    SELECT mi.name, mi.is_available
      INTO NEW.name, NEW.is_available
      FROM menu_items mi
     WHERE mi.id = NEW.linked_item_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_linked_choice ON menu_item_option_choices;
CREATE TRIGGER trg_sync_linked_choice
  BEFORE INSERT OR UPDATE OF linked_item_id ON menu_item_option_choices
  FOR EACH ROW
  EXECUTE FUNCTION sync_linked_choice_from_item();

-- ── 4. Propagation: item availability / name changes cascade to linked choices ─
-- When an add-on item is toggled off or renamed, every choice that links to it
-- follows. SECURITY DEFINER so a merchant's own toggle can update the (same-
-- restaurant) choice rows without RLS friction.
CREATE OR REPLACE FUNCTION propagate_item_to_linked_choices()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.is_available IS DISTINCT FROM OLD.is_available
     OR NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE menu_item_option_choices
       SET is_available = NEW.is_available,
           name         = NEW.name
     WHERE linked_item_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_propagate_item_to_choices ON menu_items;
CREATE TRIGGER trg_propagate_item_to_choices
  AFTER UPDATE OF is_available, name ON menu_items
  FOR EACH ROW
  EXECUTE FUNCTION propagate_item_to_linked_choices();
