/**
 * Title + description builders for storefront pages.
 *
 * The target query class is a brand-name search — "spicesenz", "spicesenz menu",
 * "spicesenz abuja delivery" — where the competition is the merchant's own
 * Instagram page and the aggregators. Two things follow from that:
 *
 *   1. The merchant's name leads every title. Never "Kitchyn" first; a searcher
 *      looking for the restaurant must see the restaurant.
 *   2. The intent word the searcher actually typed ("menu", "order", "delivery")
 *      has to appear, because a bare restaurant name matches thousands of pages.
 *
 * Everything here degrades on sparse data. Most merchants onboard with only
 * name/slug/city set (api/admin/merchants/onboard inserts the rest as null), so
 * every field beyond `name` is treated as optional and simply drops out of the
 * string rather than rendering "undefined" or an empty clause.
 */

/** The subset of a restaurant record these builders read. */
export interface RestaurantSeoFields {
  name: string;
  description: string | null;
  city: string | null;
  state: string | null;
  accepts_delivery: boolean | null;
  accepts_pickup: boolean | null;
}

/** Google truncates descriptions past ~160 chars; clip on a word boundary. */
const DESCRIPTION_MAX = 158;

function clip(text: string, max = DESCRIPTION_MAX): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[,;:.\s]+$/, "")}…`;
}

/** "Abuja" / "Abuja, FCT" / null — the location clause shared by title and description. */
function locationLabel(r: RestaurantSeoFields): string | null {
  const city = r.city?.trim();
  const state = r.state?.trim();
  if (city && state && state.toLowerCase() !== city.toLowerCase()) {
    return `${city}, ${state}`;
  }
  return city || state || null;
}

/**
 * How this merchant actually fulfils orders. Read from the 090 switches rather
 * than assumed: several merchants are delivery-only (Spicesenz, Brews and Bites),
 * and promising pickup in a meta description that Google shows verbatim is a
 * factual error about a real business, not just a wasted keyword.
 *
 * `?? true` keeps cached pre-090 records behaving as before (both methods on),
 * matching the storefront hero.
 */
function fulfilmentModes(r: RestaurantSeoFields): {
  /** Noun phrase, e.g. "delivery or pickup". */
  phrase: string;
  /** Title-case label, e.g. "Delivery & Pickup". */
  label: string;
  /** Sentence, e.g. "Delivery and pickup available." */
  sentence: string;
} {
  const delivery = r.accepts_delivery ?? true;
  const pickup = r.accepts_pickup ?? true;

  if (delivery && pickup) {
    return {
      phrase: "delivery or pickup",
      label: "Delivery & Pickup",
      sentence: "Delivery and pickup available.",
    };
  }
  if (delivery) {
    return {
      phrase: "delivery",
      label: "Delivery",
      sentence: "Delivery available.",
    };
  }
  return { phrase: "pickup", label: "Pickup", sentence: "Pickup available." };
}

/** Ensure merchant-authored copy ends a sentence before we append to it. */
function asSentence(text: string): string {
  const trimmed = text.trim();
  return /[.!?…]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/**
 * Storefront home title, e.g.
 *   "Spicesenz — Order Online in Abuja | Delivery & Pickup"
 *   "Spicesenz — Order Online | Pickup"          (no city set)
 */
export function buildStorefrontTitle(r: RestaurantSeoFields): string {
  const city = r.city?.trim();
  const where = city ? ` in ${city}` : "";
  return `${r.name} — Order Online${where} | ${fulfilmentModes(r).label}`;
}

/**
 * Menu page title, e.g.
 *   "Spicesenz Menu & Prices — Abuja"
 *   "Spicesenz Menu & Prices"
 *
 * Targets the "<brand> menu" query explicitly, which is the highest-intent
 * branded search a restaurant gets.
 */
export function buildMenuTitle(r: RestaurantSeoFields): string {
  const where = locationLabel(r);
  return `${r.name} Menu & Prices${where ? ` — ${where}` : ""}`;
}

/**
 * Storefront description. Leads with the merchant's own copy when they've
 * written any — it's the only human prose we have — then appends the ordering
 * facts a searcher scanning a results page wants.
 */
export function buildStorefrontDescription(r: RestaurantSeoFields): string {
  const where = locationLabel(r);
  const own = r.description?.trim();

  const lead = own
    ? asSentence(own)
    : `Order online from ${r.name}${where ? ` in ${where}` : ""}.`;

  // When we fell back to the generated lead the location is already in it.
  const place = own && where ? ` ${r.name} is in ${where}.` : "";

  return clip(`${lead}${place} ${fulfilmentModes(r).sentence} Order direct.`);
}

/** Menu description — same shape, but says "menu" for the "<brand> menu" query. */
export function buildMenuDescription(r: RestaurantSeoFields): string {
  const where = locationLabel(r);
  const own = r.description?.trim();
  const lead = `See the full ${r.name} menu and prices${where ? ` in ${where}` : ""}.`;
  const tail = own ? ` ${asSentence(own)}` : "";
  return clip(`${lead}${tail} Order online for ${fulfilmentModes(r).phrase}.`);
}
