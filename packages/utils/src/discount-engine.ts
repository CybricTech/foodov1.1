/**
 * Discount engine — the single source of truth for whether a discount
 * applies to a cart and how much it is worth, in kobo.
 *
 * This is a PURE function with no I/O. It is used identically by:
 *   - the storefront preview endpoint (/api/checkout/quote-discount)
 *   - checkout initialization (/api/checkout/initialize)
 *   - the payment webhooks (re-validation before recording redemption)
 *
 * Money model: discounts are merchant-funded. A subtotal discount lowers
 * `discountKobo`; a free-delivery discount sets `freeDelivery` and reports
 * the waived delivery fee as `discountKobo` so callers can subtract it from
 * the delivery line.
 */

import type { DiscountTrigger, DiscountType } from "./constants";

/**
 * A geo-fenced delivery zone targeting a discount (e.g. a campus). The
 * discount only applies when the order's destination falls within `radius_m`
 * metres of the centre. Coordinates come from Google Places / device GPS, so
 * matching is exact — no string matching.
 */
export interface DeliveryZone {
  /** Human label shown to the merchant, e.g. "Baze University". */
  name: string;
  lat: number;
  lng: number;
  /** Match radius in metres. */
  radius_m: number;
}

/**
 * Great-circle distance between two coordinates, in metres (haversine).
 * Used for delivery-zone matching; accurate enough at city scale.
 */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6_371_000; // Earth radius, metres
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** True when the destination falls within any of the given zones. */
export function isWithinAnyZone(
  zones: DeliveryZone[],
  destLat: number,
  destLng: number
): boolean {
  return zones.some(
    (z) => haversineMeters(z.lat, z.lng, destLat, destLng) <= z.radius_m
  );
}

/** The discount rule, mirroring the `discounts` table row (subset used here). */
export interface DiscountRule {
  id: string;
  trigger: DiscountTrigger;
  code: string | null;
  type: DiscountType;
  /** percentage -> whole percent; fixed -> kobo; free_delivery -> null */
  value: number | null;
  max_discount_kobo: number | null;
  min_order_kobo: number;
  fulfillment_type: "delivery" | "pickup" | null;
  starts_at: string | null;
  ends_at: string | null;
  usage_limit_total: number | null;
  usage_limit_per_customer: number | null;
  times_redeemed: number;
  is_active: boolean;
  /**
   * Optional geo-fencing. When non-empty, the discount applies only to
   * delivery orders whose destination falls within one of these zones.
   * Empty/null = applies everywhere (default).
   */
  delivery_zones?: DeliveryZone[] | null;
}

export interface DiscountContext {
  subtotalKobo: number;
  deliveryFeeKobo: number;
  fulfillmentType: "delivery" | "pickup";
  /** How many times this specific customer (by phone) has already redeemed this discount. */
  customerRedemptionCount?: number;
  /** Defaults to now. Pass a fixed clock in tests. */
  now?: Date;
  /**
   * Exact destination coordinates (picked Places suggestion or device GPS).
   * Required for a zone-targeted discount to match; absent => can't verify the
   * zone, so a zoned discount is treated as ineligible.
   */
  destinationLat?: number | null;
  destinationLng?: number | null;
}

export type DiscountIneligibleReason =
  | "inactive"
  | "not_started"
  | "expired"
  | "below_minimum"
  | "wrong_fulfillment"
  | "usage_limit_reached"
  | "per_customer_limit_reached"
  | "no_delivery_fee"
  | "outside_delivery_zone"
  | "no_benefit";

export interface DiscountResult {
  eligible: boolean;
  reason?: DiscountIneligibleReason;
  /** Discount value in kobo. For free_delivery this is the waived delivery fee. */
  discountKobo: number;
  /** True when the discount waives the delivery fee. */
  freeDelivery: boolean;
}

const INELIGIBLE = (reason: DiscountIneligibleReason): DiscountResult => ({
  eligible: false,
  reason,
  discountKobo: 0,
  freeDelivery: false,
});

/** Human-readable explanation for a customer-facing message. */
export function discountIneligibleMessage(reason: DiscountIneligibleReason): string {
  switch (reason) {
    case "inactive":
      return "This offer is no longer available.";
    case "not_started":
      return "This offer hasn't started yet.";
    case "expired":
      return "This offer has expired.";
    case "below_minimum":
      return "Your order doesn't meet the minimum for this offer.";
    case "wrong_fulfillment":
      return "This offer doesn't apply to this order type.";
    case "usage_limit_reached":
      return "This offer has reached its usage limit.";
    case "per_customer_limit_reached":
      return "You've already used this offer.";
    case "no_delivery_fee":
      return "This is a free-delivery offer and there's no delivery fee to waive.";
    case "outside_delivery_zone":
      return "This offer only applies to delivery within specific areas.";
    case "no_benefit":
      return "This offer doesn't reduce your total.";
    default:
      return "This offer can't be applied.";
  }
}

/**
 * Evaluate a single discount rule against a cart context.
 * Returns eligibility plus the kobo amount it is worth.
 */
export function computeDiscount(
  rule: DiscountRule,
  ctx: DiscountContext
): DiscountResult {
  const now = ctx.now ?? new Date();

  if (!rule.is_active) return INELIGIBLE("inactive");

  // Time window
  if (rule.starts_at && now < new Date(rule.starts_at)) {
    return INELIGIBLE("not_started");
  }
  if (rule.ends_at && now > new Date(rule.ends_at)) {
    return INELIGIBLE("expired");
  }

  // Usage limits
  if (
    rule.usage_limit_total !== null &&
    rule.times_redeemed >= rule.usage_limit_total
  ) {
    return INELIGIBLE("usage_limit_reached");
  }
  if (
    rule.usage_limit_per_customer !== null &&
    (ctx.customerRedemptionCount ?? 0) >= rule.usage_limit_per_customer
  ) {
    return INELIGIBLE("per_customer_limit_reached");
  }

  // Fulfillment restriction
  if (rule.fulfillment_type && rule.fulfillment_type !== ctx.fulfillmentType) {
    return INELIGIBLE("wrong_fulfillment");
  }

  // Delivery-zone restriction. A zoned discount only applies to delivery
  // orders whose destination falls within one of the zones. Without exact
  // coordinates (free-text address) we can't verify it, so it doesn't apply.
  if (rule.delivery_zones && rule.delivery_zones.length > 0) {
    if (ctx.fulfillmentType !== "delivery") {
      return INELIGIBLE("wrong_fulfillment");
    }
    if (
      typeof ctx.destinationLat !== "number" ||
      typeof ctx.destinationLng !== "number" ||
      !isWithinAnyZone(rule.delivery_zones, ctx.destinationLat, ctx.destinationLng)
    ) {
      return INELIGIBLE("outside_delivery_zone");
    }
  }

  // Minimum order (always measured on subtotal)
  if (ctx.subtotalKobo < rule.min_order_kobo) {
    return INELIGIBLE("below_minimum");
  }

  // Per-type amount
  switch (rule.type) {
    case "percentage": {
      const pct = rule.value ?? 0;
      let amount = Math.round((ctx.subtotalKobo * pct) / 100);
      if (rule.max_discount_kobo !== null) {
        amount = Math.min(amount, rule.max_discount_kobo);
      }
      // Never discount more than the subtotal
      amount = Math.min(amount, ctx.subtotalKobo);
      if (amount <= 0) return INELIGIBLE("no_benefit");
      return { eligible: true, discountKobo: amount, freeDelivery: false };
    }

    case "fixed": {
      const amount = Math.min(rule.value ?? 0, ctx.subtotalKobo);
      if (amount <= 0) return INELIGIBLE("no_benefit");
      return { eligible: true, discountKobo: amount, freeDelivery: false };
    }

    case "free_delivery": {
      // Only meaningful on a delivery order that actually has a fee
      if (ctx.fulfillmentType !== "delivery" || ctx.deliveryFeeKobo <= 0) {
        return INELIGIBLE("no_delivery_fee");
      }
      return {
        eligible: true,
        discountKobo: ctx.deliveryFeeKobo,
        freeDelivery: true,
      };
    }

    default:
      return INELIGIBLE("no_benefit");
  }
}

/**
 * Given a set of candidate rules (an entered code's rule and/or active
 * automatic rules), pick the single best eligible discount for the cart.
 *
 * "Best" = largest kobo benefit to the customer. Enforces the one-discount-
 * per-order rule. Returns null when nothing is eligible.
 */
export function pickBestDiscount(
  rules: DiscountRule[],
  ctx: DiscountContext,
  /** Per-rule redemption counts keyed by discount id (for per-customer limits). */
  redemptionCounts?: Record<string, number>
): { rule: DiscountRule; result: DiscountResult } | null {
  let best: { rule: DiscountRule; result: DiscountResult } | null = null;

  for (const rule of rules) {
    const result = computeDiscount(rule, {
      ...ctx,
      customerRedemptionCount:
        redemptionCounts?.[rule.id] ?? ctx.customerRedemptionCount ?? 0,
    });
    if (!result.eligible) continue;
    if (!best || result.discountKobo > best.result.discountKobo) {
      best = { rule, result };
    }
  }

  return best;
}
