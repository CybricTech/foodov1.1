/**
 * Convenience type aliases derived from the generated Database type.
 *
 * This file is intentionally separate from types.ts so it survives
 * `npx supabase gen types typescript` regenerations without being wiped.
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

export type Customer =
  Database["public"]["Tables"]["customers"]["Row"];

export type Discount =
  Database["public"]["Tables"]["discounts"]["Row"];

export type DiscountRedemption =
  Database["public"]["Tables"]["discount_redemptions"]["Row"];

// ── Insert aliases ────────────────────────────────────────────────────────────

export type DiscountInsert =
  Database["public"]["Tables"]["discounts"]["Insert"];

export type DiscountUpdate =
  Database["public"]["Tables"]["discounts"]["Update"];

export type ReviewInsert =
  Database["public"]["Tables"]["reviews"]["Insert"];

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

export type OrderWithItems = Order & {
  items: Database["public"]["Tables"]["order_items"]["Row"][];
  delivery_assignment?: Database["public"]["Tables"]["delivery_assignments"]["Row"] | null;
};

export type CustomerWithOrders = Customer & {
  orders: Array<{
    id: string;
    order_number: string;
    total_amount: number;
    status: string;
    created_at: string;
  }>;
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
