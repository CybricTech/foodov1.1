import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCachedRestaurant } from "@/lib/supabase/storefront-cache";
import { RestaurantProvider } from "@/components/storefront/restaurant-context";
import { CartGuard } from "@/components/storefront/cart-guard";
import { ClosedNotice } from "@/components/storefront/closed-notice";
import { ActiveOrderBanner } from "@/components/storefront/active-order-banner";
import { StorefrontSplash } from "@/components/storefront/storefront-splash";
import { storefrontOrigin } from "@/lib/site";

/**
 * Re-bases every storefront route onto the merchant's own subdomain.
 *
 * This is where duplicate-content consolidation actually happens. The same page
 * is reachable at three hosts/paths (see lib/site.ts), and Next resolves each
 * route's `alternates.canonical` against the nearest `metadataBase`. Declaring
 * the merchant's origin here means a request served at `kitchyn.app/spicesenz`
 * or `spicesenz.kitchyn.app/spicesenz/menu` still emits
 * `<link rel="canonical" href="https://spicesenz.kitchyn.app/…">`, pointing all
 * three at one URL without redirecting anything.
 *
 * Derived from `params`, NOT from the Host header — deliberately. Reading
 * headers() here would opt the whole segment into dynamic rendering and silently
 * destroy the ISR that generateStaticParams() below exists to enable.
 *
 * It also replaces the root "%s | Kitchyn" title template with the merchant's
 * own, so sub-pages read "Checkout | Spicesenz" — a white-label storefront must
 * never advertise our brand in its title. The two indexable pages set
 * `title.absolute` to bypass the template entirely and control their full string.
 *
 * getCachedRestaurant() here is free: React.cache() collapses it into the same
 * call the layout body and the page already make within one render.
 */
export async function generateMetadata({
  params,
}: {
  params: { restaurant_slug: string };
}): Promise<Metadata> {
  const restaurant = await getCachedRestaurant(params.restaurant_slug);
  const metadataBase = new URL(storefrontOrigin(params.restaurant_slug));
  if (!restaurant) return { metadataBase };

  return {
    metadataBase,
    title: {
      default: restaurant.name,
      template: `%s | ${restaurant.name}`,
    },
  };
}

/**
 * THE key to storefront caching. Without generateStaticParams, a
 * dynamic-segment route is ALWAYS fully dynamic at runtime — `revalidate = 60`
 * on the pages is silently ignored (verified: .next/prerender-manifest.json
 * had an empty dynamicRoutes, and production served cache-control: no-store
 * on every request). Exporting it — even returning [] — opts the whole
 * segment into on-demand ISR: first hit renders, subsequent hits are served
 * from the CDN until each page's `revalidate` window expires. Slugs are
 * deliberately NOT prefetched here so builds don't depend on DB reachability.
 */
export function generateStaticParams(): Array<{ restaurant_slug: string }> {
  return [];
}

export default async function StorefrontLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { restaurant_slug: string };
}) {
  const restaurant = await getCachedRestaurant(params.restaurant_slug);

  if (!restaurant) notFound();

  const brandColor = restaurant.primary_color ?? "#2D6A4F";

  return (
    <div
      style={{ "--brand-color": brandColor } as React.CSSProperties}
      className="min-h-screen bg-black-50"
    >
      <StorefrontSplash
        logoUrl={restaurant.logo_url ?? null}
        brandColor={brandColor}
        restaurantName={restaurant.name}
      />
      <RestaurantProvider restaurant={restaurant}>
        <ActiveOrderBanner />
        <ClosedNotice />
        <CartGuard />
        {children}
      </RestaurantProvider>
    </div>
  );
}
