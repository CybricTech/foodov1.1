/**
 * Server-side discount resolution.
 *
 * Shared by the storefront preview endpoint and checkout initialization so
 * that the math is computed in exactly one place. Always runs with the
 * service client (bypasses RLS) — promo codes are never exposed to the
 * browser.
 */

import {
  computeDiscount,
  pickBestDiscount,
  discountIneligibleMessage,
  type DiscountRule,
  type DiscountResult,
} from "@foodo/utils";
import type { Discount, TypedSupabaseClient } from "@foodo/database";

export interface ResolveDiscountInput {
  restaurantId: string;
  code?: string | null;
  subtotalKobo: number;
  deliveryFeeKobo: number;
  fulfillmentType: "delivery" | "pickup";
  customerPhone?: string | null;
}

export interface ResolvedDiscount {
  rule: Discount;
  result: DiscountResult;
}

export interface ResolveDiscountOutput {
  /** The single best discount to apply, or null if none qualifies. */
  applied: ResolvedDiscount | null;
  /**
   * Set when the customer entered a code that exists but couldn't be applied
   * (expired, below minimum, limit reached, etc.) — so the UI can explain why.
   */
  codeError?: string;
  /** Set when the entered code matched no discount at all. */
  codeNotFound?: boolean;
}

function toRule(d: Discount): DiscountRule {
  return {
    id: d.id,
    trigger: d.trigger as DiscountRule["trigger"],
    code: d.code,
    type: d.type as DiscountRule["type"],
    value: d.value,
    max_discount_kobo: d.max_discount_kobo,
    min_order_kobo: d.min_order_kobo,
    fulfillment_type: d.fulfillment_type as DiscountRule["fulfillment_type"],
    starts_at: d.starts_at,
    ends_at: d.ends_at,
    usage_limit_total: d.usage_limit_total,
    usage_limit_per_customer: d.usage_limit_per_customer,
    times_redeemed: d.times_redeemed,
    is_active: d.is_active,
  };
}

/**
 * How many times this phone has already redeemed a given discount.
 * Returns a map keyed by discount id.
 */
async function getRedemptionCounts(
  supabase: TypedSupabaseClient,
  discountIds: string[],
  phone: string | null | undefined
): Promise<Record<string, number>> {
  if (!phone || discountIds.length === 0) return {};
  const { data } = await supabase
    .from("discount_redemptions")
    .select("discount_id")
    .in("discount_id", discountIds)
    .eq("customer_phone", phone);
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.discount_id] = (counts[row.discount_id] ?? 0) + 1;
  }
  return counts;
}

/**
 * Resolve the single best discount for a cart. Enforces the one-discount-
 * per-order rule. A directly entered code wins ties against automatics.
 */
export async function resolveDiscount(
  supabase: TypedSupabaseClient,
  input: ResolveDiscountInput
): Promise<ResolveDiscountOutput> {
  const normalizedCode = input.code?.trim().toUpperCase() || null;

  // Fetch the active automatic discounts for this restaurant…
  const { data: autoRows } = await supabase
    .from("discounts")
    .select("*")
    .eq("restaurant_id", input.restaurantId)
    .eq("trigger", "automatic")
    .eq("is_active", true);

  // …plus the specific coded discount, if a code was entered.
  let codeRow: Discount | null = null;
  if (normalizedCode) {
    // Codes are stored uppercase, so an exact match avoids ilike's %/_ wildcards.
    const { data } = await supabase
      .from("discounts")
      .select("*")
      .eq("restaurant_id", input.restaurantId)
      .eq("trigger", "code")
      .eq("code", normalizedCode)
      .limit(1)
      .maybeSingle();
    codeRow = (data as Discount | null) ?? null;
  }

  // Code first so an entered code wins ties against automatics (pickBestDiscount
  // keeps the first candidate on equal value).
  const candidates: Discount[] = [];
  if (codeRow) candidates.push(codeRow);
  candidates.push(...(autoRows ?? []));

  const redemptionCounts = await getRedemptionCounts(
    supabase,
    candidates.map((c) => c.id),
    input.customerPhone
  );

  const ctx = {
    subtotalKobo: input.subtotalKobo,
    deliveryFeeKobo: input.deliveryFeeKobo,
    fulfillmentType: input.fulfillmentType,
    now: new Date(),
  };

  const best = pickBestDiscount(
    candidates.map(toRule),
    ctx,
    redemptionCounts
  );

  // Build a specific error if the entered code failed to apply.
  let codeError: string | undefined;
  let codeNotFound: boolean | undefined;
  if (normalizedCode) {
    if (!codeRow) {
      codeNotFound = true;
    } else if (!best || best.rule.id !== codeRow.id) {
      // The code exists but either didn't qualify or lost to a better automatic.
      const codeResult = computeDiscount(toRule(codeRow), {
        ...ctx,
        customerRedemptionCount: redemptionCounts[codeRow.id] ?? 0,
      });
      if (!codeResult.eligible && codeResult.reason) {
        codeError = discountIneligibleMessage(codeResult.reason);
      }
    }
  }

  const applied: ResolvedDiscount | null = best
    ? {
        rule: candidates.find((c) => c.id === best.rule.id)!,
        result: best.result,
      }
    : null;

  return { applied, codeError, codeNotFound };
}

/** Customer-facing label for an applied discount line in the order summary. */
export function discountLabel(d: ResolvedDiscount): string {
  const { rule, result } = d;
  if (result.freeDelivery) return "Free delivery";
  if (rule.type === "percentage") return `${rule.value}% off`;
  if (rule.code) return `Code ${rule.code}`;
  return rule.name;
}
