import type { Metadata } from "next";
import { transformImage } from "@/lib/images";

interface RestaurantForMetadata {
  name: string;
  banner_url: string | null;
  logo_url: string | null;
}

/**
 * Per-merchant link-preview metadata (WhatsApp/iMessage/Twitter share cards).
 * Falls back to nothing when the merchant hasn't set a banner/logo, so the
 * page keeps inheriting the app-wide icon.png / manifest icons unchanged.
 *
 * The OG image crop is center-anchored (Supabase's render endpoint has no
 * focal-point param), unlike the live hero which uses CSS object-position to
 * respect the merchant's chosen focal point (see banner_focal_x/y in
 * app/[restaurant_slug]/page.tsx) — a static share-card image can't defer
 * cropping to the client the way a rendered page can.
 */
export function getStorefrontShareMetadata(
  restaurant: RestaurantForMetadata,
  { title, description }: { title: string; description: string }
): Pick<Metadata, "openGraph" | "twitter" | "icons"> {
  const ogImage = restaurant.banner_url
    ? transformImage(restaurant.banner_url, { width: 600, height: 315, quality: 80 })
    : undefined;
  const icon = restaurant.logo_url
    ? transformImage(restaurant.logo_url, { width: 96, height: 96, quality: 90 })
    : undefined;

  const metadata: Pick<Metadata, "openGraph" | "twitter" | "icons"> = {};

  if (ogImage) {
    metadata.openGraph = {
      title,
      description,
      type: "website",
      images: [{ url: ogImage, width: 1200, height: 630, alt: restaurant.name }],
    };
    metadata.twitter = {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    };
  }

  if (icon) {
    metadata.icons = { icon, apple: icon };
  }

  return metadata;
}
