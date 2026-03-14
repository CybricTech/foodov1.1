/**
 * Order number generation utilities.
 *
 * PRD §6: order_number TEXT NOT NULL — Human-readable: e.g., "CP-0042"
 * Format: [RESTAURANT_PREFIX]-[ZERO_PADDED_SEQUENCE]
 */

/**
 * Generate a restaurant prefix from the slug.
 * "the-copper-pot" → "CP"
 * "mama-put-kitchen" → "MP"
 */
export function slugToPrefix(slug: string): string {
  const words = slug
    .split(/[-_\s]+/)
    .filter((w) => w.length > 0)
    .map((w) => w.toUpperCase());

  if (words.length === 1) {
    return words[0].slice(0, 2);
  }

  // Take first letter of first two meaningful words
  return words
    .slice(0, 2)
    .map((w) => w[0])
    .join("");
}

/**
 * Format an order number from a prefix and sequence number.
 * ("CP", 42) → "CP-0042"
 */
export function formatOrderNumber(prefix: string, sequence: number): string {
  return `${prefix.toUpperCase()}-${String(sequence).padStart(4, "0")}`;
}
