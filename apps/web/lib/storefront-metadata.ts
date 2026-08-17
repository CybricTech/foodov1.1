import type { Metadata } from "next";
import { transformImage } from "@/lib/images";

interface RestaurantForMetadata {
  name: string;
  banner_url: string | null;
  logo_url: string | null;
}

/**
 * Open Graph's recommended card size. transformImage doubles both dimensions for
 * retina, so requesting half of this yields exactly 1200×630 — the numbers we
 * then declare. Previously the request was 600×315 while the declaration claimed
 * 1200×630, so the dimensions we told crawlers never matched the bytes we served.
 */
const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

/**
 * Per-merchant link-preview + canonical metadata for a storefront page.
 *
 * Covers two jobs that have to agree with each other:
 *   - the share card used by WhatsApp/iMessage/Twitter (how the storefront looks
 *     when a customer forwards it, which is how most Kitchyn traffic spreads), and
 *   - `alternates.canonical`, which is what collapses the three URLs each
 *     storefront answers on down to one. `path` is relative to the merchant's own
 *     root and resolves against the metadataBase set in
 *     app/[restaurant_slug]/layout.tsx — so pass "/" or "/menu", never
 *     "/{slug}/menu".
 *
 * The OG image crop is center-anchored (Supabase's render endpoint has no
 * focal-point param), unlike the live hero which uses CSS object-position to
 * respect the merchant's chosen focal point (see banner_focal_x/y in
 * app/[restaurant_slug]/page.tsx) — a static share-card image can't defer
 * cropping to the client the way a rendered page can.
 */
export function getStorefrontShareMetadata(
  restaurant: RestaurantForMetadata,
  {
    title,
    description,
    path,
  }: { title: string; description: string; path: string }
): Pick<Metadata, "openGraph" | "twitter" | "icons" | "alternates"> {
  // Prefer the banner (landscape, designed to be looked at). Fall back to the
  // logo so a merchant who never uploaded a banner still gets a card with their
  // brand on it instead of a bare grey link — the previous behaviour dropped
  // openGraph entirely, and a card-less link is measurably less clickable when
  // it's forwarded through WhatsApp.
  const banner = restaurant.banner_url
    ? transformImage(restaurant.banner_url, {
        width: OG_WIDTH / 2,
        height: OG_HEIGHT / 2,
        quality: 80,
      })
    : undefined;
  const logoCard = restaurant.logo_url
    ? transformImage(restaurant.logo_url, {
        width: OG_WIDTH / 2,
        height: OG_HEIGHT / 2,
        quality: 85,
        // "contain" so a square logo isn't cropped into an unrecognisable band.
        resize: "contain",
      })
    : undefined;
  const ogImage = banner ?? logoCard;

  const icon = restaurant.logo_url
    ? transformImage(restaurant.logo_url, { width: 96, height: 96, quality: 90 })
    : undefined;

  const metadata: Pick<
    Metadata,
    "openGraph" | "twitter" | "icons" | "alternates"
  > = {
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      type: "website",
      url: path,
      siteName: restaurant.name,
      locale: "en_NG",
    },
    twitter: {
      // Without an image, a large-image card renders as an empty box; the
      // summary card degrades to a tidy text-only preview instead.
      card: ogImage ? "summary_large_image" : "summary",
      title,
      description,
    },
  };

  if (ogImage) {
    metadata.openGraph!.images = [
      { url: ogImage, width: OG_WIDTH, height: OG_HEIGHT, alt: restaurant.name },
    ];
    metadata.twitter!.images = [ogImage];
  }

  if (icon) {
    metadata.icons = { icon, apple: icon };
  }

  return metadata;
}
