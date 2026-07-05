/**
 * Currency utilities — Nigerian Naira (NGN) / Kobo
 *
 * PRD §7.2.1: Amount must be passed in kobo (multiply NGN amount by 100).
 * PRD §6: platform_riders.total_earnings_kobo BIGINT — always store in smallest unit.
 */

const KOBO_PER_NAIRA = 100;

/**
 * Convert kobo (integer) to NGN (decimal).
 * e.g., 250000 → 2500.00
 */
export function koboToNGN(kobo: number): number {
  return kobo / KOBO_PER_NAIRA;
}

/**
 * Convert NGN (decimal) to kobo (integer).
 * e.g., 2500.00 → 250000
 * Rounds to nearest kobo to avoid floating-point drift.
 */
export function ngnToKobo(ngn: number): number {
  return Math.round(ngn * KOBO_PER_NAIRA);
}

/**
 * Format a kobo integer as a human-readable NGN string.
 * e.g., 250000 → "₦2,500.00"
 */
export function formatKobo(kobo: number): string {
  return formatNGN(koboToNGN(kobo));
}

/**
 * Format an NGN amount as a human-readable string.
 * e.g., 2500 → "₦2,500.00"
 */
export function formatNGN(ngn: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(ngn);
}

/**
 * Format an NGN amount compactly (no decimals if whole number).
 * e.g., 2500 → "₦2,500"
 */
export function formatNGNCompact(ngn: number): string {
  if (ngn % 1 === 0) {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(ngn);
  }
  return formatNGN(ngn);
}

/**
 * Parse a NGN string back to a number.
 * e.g., "₦2,500.00" → 2500
 */
export function parseNGN(formatted: string): number {
  return parseFloat(formatted.replace(/[₦,\s]/g, ""));
}

/**
 * Round a customer-facing delivery fee (kobo) to the nearest ₦100.
 *
 * Distance-based pricing yields odd tail figures (e.g. ₦2,300 base + ₦1,401
 * distance = ₦3,701); rounding to the nearest hundred keeps our books free of
 * kobo/tens figures (₦3,700) without changing the delivery pricing structure.
 * e.g. 370100 → 370000, 365000 → 370000.
 */
export function roundDeliveryFeeKobo(feeKobo: number): number {
  if (feeKobo <= 0) return 0; // pickup / genuine free delivery stays ₦0
  const ROUND_TO_KOBO = 10000; // ₦100
  const rounded = Math.round(feeKobo / ROUND_TO_KOBO) * ROUND_TO_KOBO;
  // A positive fee must never round down to ₦0 (a sub-₦50 fee would otherwise
  // become accidental free delivery); floor it at one rounding step.
  return Math.max(rounded, ROUND_TO_KOBO);
}

/**
 * Calculate delivery fee in kobo given a distance.
 * Uses the hardcoded fallback constants — the live endpoint uses platform_settings.
 * Returns -1 if the distance exceeds the maximum radius.
 * The returned fee is rounded to the nearest ₦100 (see roundDeliveryFeeKobo).
 */
export function calculateDeliveryFee(
  distanceKm: number,
  options?: {
    baseFeeKobo?: number;
    perKmRateKobo?: number;
    maxRadiusKm?: number;
    maxFeeKobo?: number;
  }
): number {
  // Import lazily to avoid circular deps — values must be passed in or will use module defaults
  const base = options?.baseFeeKobo ?? 230000;
  const perKm = options?.perKmRateKobo ?? 15000;
  const maxRadius = options?.maxRadiusKm ?? 25;
  const maxFee = options?.maxFeeKobo ?? 1500000;

  if (distanceKm > maxRadius) return -1;
  const fee = base + Math.round(distanceKm * perKm);
  return roundDeliveryFeeKobo(Math.min(fee, maxFee));
}
