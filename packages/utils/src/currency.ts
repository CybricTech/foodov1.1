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
 * Calculate delivery fee in kobo given a distance.
 * Uses the hardcoded fallback constants — the live endpoint uses platform_settings.
 * Returns -1 if the distance exceeds the maximum radius.
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
  return Math.min(fee, maxFee);
}
