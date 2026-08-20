/**
 * The one place a delivery address is assembled and judged.
 *
 * A delivery address is authored once, at checkout, from two sources that must
 * not be confused: a place the customer *picked* from Google autocomplete, and
 * free text they *typed* for the apartment, floor or unit. Historically those
 * were glued into a single column the moment they arrived, which loses the
 * distinction permanently — and the glue is where most of the damage happened.
 * A sample of twelve recent deliveries found five malformed addresses, none of
 * them Bolt's doing:
 *
 *   "11 Moundou Street, Wuse, Abuja, Nigeria, 11 moundou street"  apt repeats street
 *   "3FH2+X62, Mabushi, Abuja 900108, …"                          plus-code, no street
 *   "CITEC), Jabi, A7 Street, Airport Road, …"                    malformed pick
 *   "Drizzleberry Cakes and Kraft, Abuja, Nigeria, 1st floor"     business as address
 *
 * These functions are pure so the rules are testable in isolation: they decide
 * what a rider is told, and a wrong answer here is not an error anyone sees —
 * it is a phone call from a confused driver an hour later.
 */

export type AddressQuality =
  /** Starts with a street number — the best case. */
  | "precise"
  /** A real street or area, but no building number. */
  | "approximate"
  /** An Open Location Code. Google had no street for the point. */
  | "plus_code"
  /** Nothing usable. */
  | "unknown";

/**
 * Open Location Codes use a 20-character alphabet chosen to avoid forming
 * words, and always carry a "+". Matching the shape rather than validating the
 * code: a false positive costs a diagnostic label, not a delivery.
 */
const PLUS_CODE = /\b[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,7}\b/i;

/** Leading building number, e.g. "17 Ogbomosho St" or "11B Moundou Street". */
const LEADING_STREET_NUMBER = /^\s*\d+[a-z]?[,\s]/i;

/** Lowercase, strip punctuation, collapse whitespace — for comparison only. */
function comparable(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Trims, collapses whitespace, and drops empty comma segments ("a, , b"). */
export function tidyAddress(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value
    .split(",")
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter((part) => part.length > 0)
    .join(", ")
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}

export function classifyAddress(value: string | null | undefined): AddressQuality {
  const address = tidyAddress(value);
  if (!address) return "unknown";
  // Checked before street number: "3FH2+X62, Mabushi" would otherwise look
  // precise to a naive numeric test, and it is the opposite of precise.
  if (PLUS_CODE.test(address)) return "plus_code";
  if (LEADING_STREET_NUMBER.test(address)) return "precise";
  return "approximate";
}

/**
 * True when the typed unit adds nothing the picked address doesn't already say.
 *
 * Customers routinely retype the street into the apartment box, producing
 * "11 Moundou Street, Wuse, Abuja, Nigeria, 11 moundou street". Appending that
 * makes the address longer and no more findable, so it is dropped.
 *
 * Deliberately one-directional: the unit being contained in the address is
 * redundancy, but the address being contained in a longer unit is not — that is
 * a customer adding genuine detail, and it is kept.
 */
export function isRedundantAptUnit(
  baseAddress: string | null | undefined,
  aptUnit: string | null | undefined
): boolean {
  const base = comparable(baseAddress ?? "");
  const apt = comparable(aptUnit ?? "");
  if (!base || !apt) return false;
  return base.includes(apt);
}

export interface DeliveryAddressParts {
  /** The Google formatted address of the picked place. */
  baseAddress?: string | null;
  /** Apartment / suite / floor, as typed. */
  aptUnit?: string | null;
  /**
   * `orders.delivery_address` — the pre-existing glued column. Used only when
   * the components are absent, i.e. for orders placed before they were stored.
   */
  legacyAddress?: string | null;
}

/**
 * The address string a rider should be given.
 *
 * Prefers the components, because they can be composed deliberately; falls back
 * to the legacy column so orders placed before the components existed still
 * dispatch with the best string available rather than nothing.
 */
export function composeDeliveryAddress(parts: DeliveryAddressParts): string | null {
  const base = tidyAddress(parts.baseAddress);
  const apt = tidyAddress(parts.aptUnit);

  if (!base) return tidyAddress(parts.legacyAddress);
  if (!apt || isRedundantAptUnit(base, apt)) return base;

  return `${base}, ${apt}`;
}

/**
 * Whether an address is worth sending to a dispatch provider as a label.
 *
 * A plus-code is not: it is a coordinate wearing a costume, so it tells a rider
 * nothing their map isn't already showing them, and it risks a provider
 * rejecting the whole booking for an address it cannot resolve. In that case
 * the coordinates alone are the honest input.
 */
export function isDispatchableAddress(value: string | null | undefined): boolean {
  const quality = classifyAddress(value);
  return quality === "precise" || quality === "approximate";
}
