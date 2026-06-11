/**
 * Order types + kanban config — ported 1:1 from the web frontline client so the
 * mobile queue behaves identically (same column→status mapping, same accent
 * colors derived from brand tokens).
 */
import type { Database } from "@foodo/database";
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
  order_items: Array<{
    id: string;
    item_name: string;
    quantity: number;
    line_total_kobo: number;
    selected_options: OptionSnapshot[] | null;
  }>;
};

export type Column = "new" | "in_progress" | "in_transit" | "completed";

export const COLUMN_ORDER: Column[] = [
  "new",
  "in_progress",
  "in_transit",
  "completed",
];

/** EXACT mirror of web COLUMN_STATUSES. */
export const COLUMN_STATUSES: Record<Column, string[]> = {
  new: ["pending", "confirmed"],
  in_progress: ["preparing"],
  in_transit: ["ready_for_pickup", "assigned_to_rider", "in_transit"],
  completed: ["delivered"],
};

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

export function columnForStatus(status: string): Column | null {
  if (COLUMN_STATUSES.new.includes(status)) return "new";
  if (COLUMN_STATUSES.in_progress.includes(status)) return "in_progress";
  if (COLUMN_STATUSES.in_transit.includes(status)) return "in_transit";
  if (COLUMN_STATUSES.completed.includes(status)) return "completed";
  return null;
}

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
  special_instructions, delivery_address, dispatch_type,
  order_items (id, item_name, quantity, line_total_kobo, selected_options)
`;
