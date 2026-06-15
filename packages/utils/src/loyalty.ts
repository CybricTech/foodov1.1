/**
 * Loyalty (stamp-card) helpers — shared by web + mobile so the merchant config
 * preview, the customer-facing progress UI, and (later) checkout redemption all
 * describe the same program identically.
 *
 * Reward shapes mirror the discounts engine: percentage / fixed / free_delivery
 * / free_item. All money in kobo (integer).
 */
import { formatKobo } from "./currency";

export type LoyaltyRewardType = "percentage" | "fixed" | "free_delivery" | "free_item";

export type LoyaltyEarnScope = "order" | "item";

/** The configurable fields of a restaurant's stamp-card program. */
export interface LoyaltyProgram {
  stamps_required: number;
  earn_min_order_kobo: number;
  /** "order" = a stamp per paid order; "item" = a stamp per qualifying item unit. */
  earn_scope: string; // LoyaltyEarnScope at runtime
  /** Items that earn a stamp when earn_scope === "item". */
  earn_item_ids: string[];
  reward_type: string; // LoyaltyRewardType at runtime
  reward_value: number | null;
  reward_max_discount_kobo: number | null;
  /** Eligible menu items for a free_item reward. */
  reward_item_ids: string[];
  reward_label: string | null;
}

/** A cart line, minimal fields needed to value a free-item reward. */
export interface LoyaltyCartItem {
  menuItemId: string;
  unitPriceKobo: number;
}

/**
 * Customer-facing description of what the reward gives, e.g.
 * "Free delivery", "20% off your order", "₦1,000 off", or the merchant's
 * free-item label. Falls back to a sensible default per type.
 */
export function formatLoyaltyReward(program: Pick<LoyaltyProgram, "reward_type" | "reward_value" | "reward_label">): string {
  const label = program.reward_label?.trim();
  switch (program.reward_type) {
    case "free_delivery":
      return label || "Free delivery";
    case "free_item":
      return label || "A free item";
    case "percentage":
      return label || `${program.reward_value ?? 0}% off your order`;
    case "fixed":
      return label || `${formatKobo(program.reward_value ?? 0)} off`;
    default:
      return label || "A reward";
  }
}

export interface LoyaltyProgress {
  /** Current stamp balance (never negative). */
  balance: number;
  /** Stamps needed to unlock the reward. */
  required: number;
  /** Whether the customer has enough stamps to redeem now. */
  redeemable: boolean;
  /** Stamps remaining until the next reward (0 once redeemable). */
  remaining: number;
}

/** Derive progress for display from a raw ledger balance. */
export function loyaltyProgress(balance: number, stampsRequired: number): LoyaltyProgress {
  const b = Math.max(0, balance);
  const required = Math.max(1, stampsRequired);
  const redeemable = b >= required;
  return {
    balance: b,
    required,
    redeemable,
    remaining: redeemable ? 0 : required - b,
  };
}

export interface LoyaltyRewardKobo {
  /** Reduction applied to the subtotal (percentage / fixed). */
  discountSubtotalKobo: number;
  /** Delivery fee waived (free_delivery). */
  discountDeliveryKobo: number;
}

/**
 * The kobo value of an in-cart eligible free item — the cheapest cart line whose
 * menu item is in the reward's eligible set. Returns 0 when none is in the cart
 * (the customer is then prompted to add one). One unit is freed.
 */
export function freeItemRewardKobo(
  rewardItemIds: string[],
  items: LoyaltyCartItem[]
): number {
  if (!rewardItemIds?.length || !items?.length) return 0;
  const eligible = items
    .filter((i) => rewardItemIds.includes(i.menuItemId))
    .map((i) => Math.max(0, i.unitPriceKobo));
  return eligible.length > 0 ? Math.min(...eligible) : 0;
}

/**
 * The kobo value of a program's reward against a given order, mirroring the
 * discounts engine. For `free_item` the value is one eligible item that's in the
 * cart (the cheapest); if none is present it returns 0 and the caller should NOT
 * spend stamps — the customer is prompted to add a qualifying item instead.
 */
export function computeLoyaltyRewardKobo(
  program: Pick<LoyaltyProgram, "reward_type" | "reward_value" | "reward_max_discount_kobo" | "reward_item_ids">,
  order: { subtotalKobo: number; deliveryFeeKobo: number; items?: LoyaltyCartItem[] }
): LoyaltyRewardKobo {
  const zero = { discountSubtotalKobo: 0, discountDeliveryKobo: 0 };
  switch (program.reward_type) {
    case "free_delivery":
      return { discountSubtotalKobo: 0, discountDeliveryKobo: Math.max(0, order.deliveryFeeKobo) };
    case "fixed":
      return {
        discountSubtotalKobo: Math.min(Math.max(0, program.reward_value ?? 0), order.subtotalKobo),
        discountDeliveryKobo: 0,
      };
    case "percentage": {
      const pct = program.reward_value ?? 0;
      if (pct <= 0) return zero;
      let d = Math.round((order.subtotalKobo * pct) / 100);
      if (program.reward_max_discount_kobo && program.reward_max_discount_kobo > 0) {
        d = Math.min(d, program.reward_max_discount_kobo);
      }
      return { discountSubtotalKobo: Math.min(d, order.subtotalKobo), discountDeliveryKobo: 0 };
    }
    case "free_item": {
      const v = freeItemRewardKobo(program.reward_item_ids ?? [], order.items ?? []);
      return { discountSubtotalKobo: Math.min(v, order.subtotalKobo), discountDeliveryKobo: 0 };
    }
    default:
      return zero;
  }
}
