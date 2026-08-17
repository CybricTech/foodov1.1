/**
 * schema.org structured data for storefronts.
 *
 * This is the single highest-leverage thing we can hand Google for a restaurant:
 * it's what makes a result eligible for the rich treatment (star rating, price
 * range, opening hours, menu links) instead of a plain blue link, and it tells
 * Google that `spicesenz.kitchyn.app` IS the restaurant rather than a page that
 * merely mentions it.
 *
 * Everything below is built from data the storefront ALREADY fetches and
 * server-renders — no extra queries. See app/[restaurant_slug]/page.tsx.
 *
 * ── Honesty rules, deliberately enforced in code ───────────────────────────
 * Structured data that overstates gets manual-actioned, and half our merchants
 * onboard with almost every field null. So every property here is omitted rather
 * than guessed:
 *   - `geo` only when BOTH lat and lng exist. Five live stores have neither, and
 *     migration 094 documents one whose stored coordinates were ~20km from its
 *     real address — so unverified coordinates are worse than none.
 *   - `aggregateRating` only when reviewCount > 0. An empty or invented rating is
 *     the single most common cause of a structured-data penalty.
 *   - `priceRange` is COMPUTED from real menu prices, never a guessed "₦₦".
 *   - `openingHoursSpecification` only for days the merchant actually enabled.
 */
import type { MenuCategory, MenuItemWithOptions, Restaurant } from "@foodo/database";
import type { OpeningHours } from "@foodo/utils";

/** schema.org expects full English day names in `dayOfWeek`. */
const SCHEMA_DAYS: Record<string, string> = {
  sun: "Sunday",
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
};

/** A JSON-LD node. Loosely typed on purpose — schema.org is open-ended. */
export type JsonLdNode = Record<string, unknown>;

/** Drop null/undefined/empty entries so we never emit `"telephone": null`. */
function compact(node: JsonLdNode): JsonLdNode {
  return Object.fromEntries(
    Object.entries(node).filter(([, v]) => {
      if (v === null || v === undefined || v === "") return false;
      if (Array.isArray(v) && v.length === 0) return false;
      return true;
    })
  );
}

function nairaFromKobo(kobo: number): string {
  return `₦${Math.round(kobo / 100).toLocaleString("en-NG")}`;
}

/**
 * Map the `opening_hours` JSONB (see migration 024 and
 * packages/utils/src/opening-hours.ts) onto OpeningHoursSpecification.
 *
 * Returns undefined when no hours are configured — which the app treats as "the
 * schedule imposes no closure", NOT as "open 24/7". Claiming 24/7 hours for a
 * merchant who simply never filled the form would be a false statement about a
 * real business, so we stay silent instead.
 *
 * Overnight windows (close <= open, e.g. 18:00→02:00) are emitted as stored;
 * schema.org has no cross-midnight form and consumers handle the wrap.
 */
export function openingHoursSpecification(
  hours: OpeningHours | null | undefined
): JsonLdNode[] | undefined {
  if (!hours || Object.keys(hours).length === 0) return undefined;

  const spec = Object.entries(SCHEMA_DAYS)
    .filter(([key]) => hours[key]?.enabled && hours[key]?.open && hours[key]?.close)
    .map(([key, dayName]) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: `https://schema.org/${dayName}`,
      opens: hours[key].open,
      closes: hours[key].close,
    }));

  return spec.length > 0 ? spec : undefined;
}

/** PostalAddress from the free-text address fields. Undefined if we know nothing. */
function postalAddress(r: Restaurant): JsonLdNode | undefined {
  const street = r.address?.trim();
  const city = r.city?.trim();
  const state = r.state?.trim();
  if (!street && !city && !state) return undefined;

  return compact({
    "@type": "PostalAddress",
    streetAddress: street,
    addressLocality: city,
    addressRegion: state,
    addressCountry: "NG",
  });
}

/** An honest price range from real menu prices, e.g. "₦1,500–₦8,000". */
function priceRange(items: MenuItemWithOptions[]): string | undefined {
  const prices = items
    .map((i) => i.price_kobo)
    .filter((p): p is number => typeof p === "number" && p > 0);
  if (prices.length === 0) return undefined;

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? nairaFromKobo(min) : `${nairaFromKobo(min)}–${nairaFromKobo(max)}`;
}

export interface RestaurantJsonLdInput {
  restaurant: Restaurant;
  /** Canonical storefront origin, e.g. `https://spicesenz.kitchyn.app`. */
  origin: string;
  /** Available menu items — used for priceRange only. */
  items: MenuItemWithOptions[];
  rating: { average: number; count: number };
  /** Absolute banner/logo URLs, already transformed. */
  images: { banner?: string; logo?: string };
}

/**
 * The `Restaurant` node — the anchor for the whole storefront.
 *
 * `@id` is stable (`<origin>/#restaurant`) so the Menu node on the menu page can
 * point back at the same entity instead of declaring a second, unrelated one.
 */
export function restaurantJsonLd({
  restaurant: r,
  origin,
  items,
  rating,
  images,
}: RestaurantJsonLdInput): JsonLdNode {
  const socials = [
    r.instagram_url,
    r.facebook_url,
    r.twitter_url,
    r.youtube_url,
  ].filter((u): u is string => !!u?.trim());

  const hasGeo = r.latitude != null && r.longitude != null;

  return compact({
    "@context": "https://schema.org",
    "@type": "Restaurant",
    "@id": `${origin}/#restaurant`,
    name: r.name.trim(),
    url: `${origin}/`,
    // Merchant-typed, so trailing whitespace is common; compact() drops it if
    // trimming leaves nothing.
    description: r.description?.trim() || undefined,
    image: [images.banner, images.logo].filter(Boolean),
    logo: images.logo,
    telephone: r.phone ?? undefined,
    address: postalAddress(r),
    geo: hasGeo
      ? {
          "@type": "GeoCoordinates",
          latitude: r.latitude,
          longitude: r.longitude,
        }
      : undefined,
    sameAs: socials,
    priceRange: priceRange(items),
    currenciesAccepted: "NGN",
    openingHoursSpecification: openingHoursSpecification(
      r.opening_hours as OpeningHours | null
    ),
    aggregateRating:
      rating.count > 0
        ? {
            "@type": "AggregateRating",
            ratingValue: Number(rating.average.toFixed(1)),
            reviewCount: rating.count,
            bestRating: 5,
            worstRating: 1,
          }
        : undefined,
    hasMenu: `${origin}/menu`,
    // The storefront takes orders for immediate fulfilment; it is not a booking
    // system, and saying so prevents Google offering a reservation affordance.
    acceptsReservations: false,
  });
}

export interface MenuJsonLdInput {
  restaurant: Restaurant;
  origin: string;
  categories: MenuCategory[];
  items: MenuItemWithOptions[];
}

/**
 * The `Menu` node for /menu, sectioned by category.
 *
 * Only `items` the storefront actually renders are included — getMenuItems
 * already filters `is_available` and `is_addon_only`, so add-on-only items (the
 * linked-choice mechanism from migration 086) correctly stay out: they aren't
 * dishes a customer can order on their own.
 */
export function menuJsonLd({
  restaurant: r,
  origin,
  categories,
  items,
}: MenuJsonLdInput): JsonLdNode {
  const byCategory = new Map<string, MenuItemWithOptions[]>();
  for (const item of items) {
    if (!item.category_id) continue;
    const bucket = byCategory.get(item.category_id);
    if (bucket) bucket.push(item);
    else byCategory.set(item.category_id, [item]);
  }

  const sections = categories
    .map((category) => {
      const sectionItems = byCategory.get(category.id) ?? [];
      if (sectionItems.length === 0) return null;
      return compact({
        "@type": "MenuSection",
        name: category.name,
        description: category.description ?? undefined,
        hasMenuItem: sectionItems.map((item) =>
          compact({
            "@type": "MenuItem",
            name: item.name,
            description: item.description ?? undefined,
            image: item.image_url ?? undefined,
            offers: {
              "@type": "Offer",
              price: (item.price_kobo / 100).toFixed(2),
              priceCurrency: "NGN",
              availability: "https://schema.org/InStock",
            },
          })
        ),
      });
    })
    .filter((s): s is JsonLdNode => s !== null);

  return compact({
    "@context": "https://schema.org",
    "@type": "Menu",
    "@id": `${origin}/menu#menu`,
    name: `${r.name} Menu`,
    url: `${origin}/menu`,
    inLanguage: "en-NG",
    // Ties the menu back to the Restaurant node declared on the home page.
    provider: { "@id": `${origin}/#restaurant` },
    hasMenuSection: sections,
  });
}

/**
 * BreadcrumbList for a storefront sub-page. Gives Google the site hierarchy so
 * results show "Spicesenz › Menu" instead of a bare URL.
 */
export function breadcrumbJsonLd(
  origin: string,
  trail: Array<{ name: string; path: string }>
): JsonLdNode {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: crumb.name,
      item: `${origin}${crumb.path === "/" ? "/" : crumb.path}`,
    })),
  };
}
