/**
 * Order types + kanban config — ported 1:1 from the web frontline client so the
 * mobile queue behaves identically (same column→status mapping, same accent
 * colors derived from brand tokens).
 */
import type { Database } from "@foodo/database";
import { getFrontlineColumn, type FrontlineColumn } from "@foodo/utils";
import { theme } from "../../theme";

export type OptionChoice = {
  choiceId: string;
  choiceName: string;
  priceModifierKobo: number;
  quantity?: number;
};

export type OptionSnapshot = {
  optionId: string;
  optionName: string;
  choices: OptionChoice[];
};

export type OrderRow = Database["public"]["Tables"]["orders"]["Row"] & {
  subtotal_kobo: number;
  delivery_fee_kobo: number;
  vat_kobo: number;
  service_fee_kobo: number;
  discount_kobo: number;
  discount_code: string | null;
  total_kobo: number;
  // Scheduled orders (087) — explicit here until types are regenerated.
  scheduled_for: string | null;
  activated_at: string | null;
  order_items: Array<{
    id: string;
    item_name: string;
    quantity: number;
    line_total_kobo: number;
    selected_options: OptionSnapshot[] | null;
    // Embedded from menu_items so the accept dialog can default the ETA to the
    // longest item prep time. Null when the menu item was since deleted.
    menu_items?: { prep_time_minutes: number | null } | null;
  }>;
};

/** Platform fallback when no item carries a prep time (matches the checkout webhook). */
export const DEFAULT_PREP_MINUTES = 20;

/** The order's default estimated-ready time: the longest prep time of its items. */
export function defaultPrepMinutes(order: OrderRow): number {
  const times = order.order_items
    .map((i) => i.menu_items?.prep_time_minutes)
    .filter((p): p is number => typeof p === "number" && p > 0);
  return times.length > 0 ? Math.max(...times) : DEFAULT_PREP_MINUTES;
}

export type Column = FrontlineColumn;

export const COLUMN_ORDER: Column[] = [
  "scheduled",
  "new",
  "in_progress",
  "in_transit",
  "completed",
];

/**
 * High-contrast, large-tap-target color config per column. Web uses Tailwind
 * shade ramps (dixie/purple/blue/viridian) that don't all exist in the mobile
 * token palette, so we map each column to concrete hex from `theme` + a couple
 * of explicit accents to keep parity with the web meaning:
 *   new = warning/dixie, in_progress = brand purple, in_transit = blue,
 *   completed = success/viridian.
 */
export const COLUMN_CONFIG: Record<
  Column,
  { label: string; accent: string; accentSoft: string }
> = {
  scheduled: {
    label: "Scheduled",
    accent: theme.colors.brandDark,
    accentSoft: theme.colors.primary[50],
  },
  new: {
    label: "New",
    accent: theme.colors.dixie[500],
    accentSoft: theme.colors.dixie[100],
  },
  in_progress: {
    label: "In Progress",
    accent: theme.colors.brand,
    accentSoft: theme.colors.primary[50],
  },
  in_transit: {
    label: "In Transit",
    accent: "#2563EB",
    accentSoft: "#EFF6FF",
  },
  completed: {
    label: "Completed",
    accent: theme.colors.viridian[500],
    accentSoft: theme.colors.viridian[100],
  },
};

export { getFrontlineColumn };

export function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(dateStr).toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
  });
}

export function getItemCount(order: OrderRow): number {
  return order.order_items.reduce((sum, item) => sum + item.quantity, 0);
}

/** The single Supabase select used for both initial load and reconnect catch-up. */
export const ORDERS_SELECT = `
  id, order_number, status, payment_status, fulfillment_type,
  customer_name, customer_phone, subtotal_kobo, delivery_fee_kobo,
  vat_kobo, service_fee_kobo, discount_kobo, discount_code, total_kobo, created_at,
  special_instructions, delivery_address, dispatch_type, estimated_delivery_at,
  scheduled_for, activated_at,
  order_items (id, item_name, quantity, line_total_kobo, selected_options, menu_items (prep_time_minutes))
`;
