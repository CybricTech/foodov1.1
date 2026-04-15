/**
 * Convenience type aliases derived from the generated Database type.
 *
 * This file is intentionally separate from types.ts so it survives
 * `npx supabase gen types typescript` regenerations.
 */
import type { Database } from "./types";

// ── Row aliases ───────────────────────────────────────────────────────────────

export type Restaurant =
  Database["public"]["Tables"]["restaurants"]["Row"];

export type Order =
  Database["public"]["Tables"]["orders"]["Row"];

export type MenuCategory =
  Database["public"]["Tables"]["menu_categories"]["Row"];

export type Review =
  Database["public"]["Tables"]["reviews"]["Row"];

// ── Composite types ───────────────────────────────────────────────────────────

export type MenuItemOptionChoice =
  Database["public"]["Tables"]["menu_item_option_choices"]["Row"];

export type MenuItemOption =
  Database["public"]["Tables"]["menu_item_options"]["Row"] & {
    choices: MenuItemOptionChoice[];
  };

export type MenuItemWithOptions =
  Database["public"]["Tables"]["menu_items"]["Row"] & {
    options?: MenuItemOption[];
  };

// ── Snapshot type (used in cart and order items) ──────────────────────────────

export interface SelectedOptionSnapshot {
  optionId: string;
  optionName: string;
  choices: Array<{
    choiceId: string;
    choiceName: string;
    priceModifierKobo: number;
    quantity?: number;
  }>;
}
