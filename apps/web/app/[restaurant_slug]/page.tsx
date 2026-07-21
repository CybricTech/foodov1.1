import type { CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Star, Clock, ShoppingBag, Store, Bike } from "lucide-react";
import {
  getCachedRestaurant,
  getCachedReviews,
  getCachedRatingSummary,
  getCachedMenuItems,
  withFallback,
} from "@/lib/supabase/storefront-cache";
import { LandingFeatured } from "@/components/storefront/landing-featured";
import { transformImage } from "@/lib/images";
import { getActiveMenuSale } from "@/lib/discounts";
import { ReviewsSection } from "@/components/storefront/reviews-section";
import { LocationSection } from "@/components/storefront/location-section";
import { ActiveOrderBanner } from "@/components/storefront/active-order-banner";

export const revalidate = 60;

/** Clamp a stored focal-point value (0-100) to a safe CSS percentage, defaulting to center. */
function clampPct(value: number | null | undefined): number {
  if (value == null || Number.isNaN(value)) return 50;
  return Math.min(100, Math.max(0, value));
}

interface StorefrontPageProps {
  params: { restaurant_slug: string };
}

export async function generateMetadata({ params }: StorefrontPageProps) {
  const restaurant = await getCachedRestaurant(params.restaurant_slug);
  if (!restaurant) return {};
  return {
    title: restaurant.name,
    description: restaurant.description ?? `Order from ${restaurant.name}`,
  };
}

export default async function StorefrontPage({ params }: StorefrontPageProps) {
  const restaurant = await getCachedRestaurant(params.restaurant_slug);
  if (!restaurant) notFound();

  // Non-critical reads degrade gracefully: a transient Supabase failure on
  // reviews/featured/sale must not crash the storefront (it did on 2026-06-11
  // via a Cloudflare 525 — Sentry JAVASCRIPT-NEXTJS-Z). Only the restaurant
  // lookup above is fatal, and it's caught by error.tsx.
  const [items, reviews, ratingSummary, sale] = await Promise.all([
    withFallback(getCachedMenuItems(restaurant.id), [], "storefront:menu-items"),
    withFallback(getCachedReviews(restaurant.id), [], "storefront:reviews"),
    withFallback(
      getCachedRatingSummary(restaurant.id),
      { average: 0, count: 0 },
      "storefront:rating"
    ),
    withFallback(getActiveMenuSale(restaurant.id), null, "storefront:sale"),
  ]);
  const featured = items
    .filter((i) => i.is_featured)
    .sort(
      (a, b) =>
        a.featured_order - b.featured_order ||
        Date.parse(b.created_at) - Date.parse(a.created_at)
    );

  // Merchant fulfillment switches (090). ?? true keeps cached pre-090 records
  // behaving as before (both methods on).
  const allowsDelivery = restaurant.accepts_delivery ?? true;
  const allowsPickup = restaurant.accepts_pickup ?? true;
  const singleMethod = !allowsDelivery || !allowsPickup;

  const hasInfoChips =
    ratingSummary.count > 0 ||
    (!!restaurant.estimated_delivery_minutes && allowsDelivery) ||
    !!restaurant.min_order_amount ||
    singleMethod;

  return (
    <>
      <ActiveOrderBanner />
    <div className="min-h-screen bg-white">
      {/* ── Hero ── */}
      <section
        className="relative w-full h-[72vh] min-h-[480px] max-h-[720px]"
        style={
          {
            "--hero-pos-mobile": `${clampPct(restaurant.banner_focal_x_mobile)}% ${clampPct(restaurant.banner_focal_y_mobile)}%`,
            "--hero-pos-desktop": `${clampPct(restaurant.banner_focal_x)}% ${clampPct(restaurant.banner_focal_y)}%`,
          } as CSSProperties
        }
      >
        {/* Background */}
        {restaurant.banner_url ? (
          <Image
            // The banner is already client-compressed to a 2000px max edge on
            // upload (compressImage), so it's served as-is rather than
            // through transformImage's fixed-box "cover" crop — that crop is
            // anchored to the *source photo's* center, which would fight the
            // merchant's chosen focal point (093) before object-position ever
            // gets a say.
            src={restaurant.banner_url}
            alt={restaurant.name}
            fill
            className="object-cover storefront-hero-img"
            sizes="100vw"
            priority
            unoptimized
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/90 via-primary/70 to-black/80" />
        )}

        {/* Gradient layers — bottom-heavy for text legibility */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-black/40" />

        {/* Top bar — logo + track order */}
        <div className="absolute top-0 inset-x-0 z-20 px-5 pt-5 flex items-center justify-between">
          {restaurant.logo_url ? (
            <div className="relative w-14 h-14 rounded-2xl overflow-hidden border-2 border-white/30 shadow-xl bg-white flex-shrink-0">
              <Image
                src={transformImage(restaurant.logo_url, { width: 56, height: 56 })}
                alt={`${restaurant.name} logo`}
                fill
                className="object-cover"
                unoptimized
              />
            </div>
          ) : (
            <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center shadow-xl">
              <span className="text-white font-bold text-xl">
                {restaurant.name.charAt(0)}
              </span>
            </div>
          )}
          <Link
            href={`/${params.restaurant_slug}/orders/track`}
            className="bg-white text-gray-900 text-xs font-semibold px-3 py-2 rounded-full border border-white/30 shadow-xl hover:bg-gray-100 transition-colors"
          >
            Track order
          </Link>
        </div>

        {/* Bottom content */}
        <div className="absolute bottom-0 left-0 right-0 px-5 pb-8 space-y-4">
          {/* Closed badge */}
          {!restaurant.accepts_orders && (
            <div className="inline-flex items-center gap-1.5 bg-cinnabar-500 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-md">
              <span className="w-1.5 h-1.5 rounded-full bg-white/80" />
              Currently closed
            </div>
          )}

          {/* Restaurant name */}
          <h1 className="text-white text-[2.15rem] font-extrabold leading-tight tracking-tight">
            {restaurant.name}
          </h1>

          {/* Description */}
          {restaurant.description && (
            <p className="text-white/75 text-sm font-medium leading-relaxed line-clamp-2">
              {restaurant.description}
            </p>
          )}

          {/* Info chips */}
          {hasInfoChips && (
            <div className="flex items-center gap-2 flex-wrap">
              {ratingSummary.count > 0 && (
                <span className="inline-flex items-center gap-1 bg-white/15 backdrop-blur-sm text-white text-xs font-semibold px-2.5 py-1.5 rounded-full border border-white/20">
                  <Star size={10} fill="currentColor" />
                  {ratingSummary.average.toFixed(1)}
                  <span className="text-white/60">({ratingSummary.count})</span>
                </span>
              )}
              {restaurant.estimated_delivery_minutes && allowsDelivery && (
                <span className="inline-flex items-center gap-1 bg-white/15 backdrop-blur-sm text-white text-xs font-semibold px-2.5 py-1.5 rounded-full border border-white/20">
                  <Clock size={10} />
                  {restaurant.estimated_delivery_minutes} min
                </span>
              )}
              {singleMethod && (
                <span className="inline-flex items-center gap-1 bg-white/15 backdrop-blur-sm text-white text-xs font-semibold px-2.5 py-1.5 rounded-full border border-white/20">
                  {allowsPickup ? <Store size={10} /> : <Bike size={10} />}
                  {allowsPickup ? "Pickup only" : "Delivery only"}
                </span>
              )}
              {restaurant.min_order_amount && (
                <span className="inline-flex items-center gap-1 bg-white/15 backdrop-blur-sm text-white text-xs font-semibold px-2.5 py-1.5 rounded-full border border-white/20">
                  <ShoppingBag size={10} />
                  Min ₦{(restaurant.min_order_amount / 100).toLocaleString()}
                </span>
              )}
            </div>
          )}

          {/* CTAs */}
          <div className="flex gap-2.5 pt-1">
            <Link
              href={`/${params.restaurant_slug}/menu`}
              className="flex-1 bg-primary text-white text-center py-3.5 rounded-2xl font-bold text-sm hover:opacity-90 transition-opacity cursor-pointer"
            >
              {restaurant.accepts_orders ? "Order now" : "Browse menu"}
            </Link>
            <Link
              href={`/${params.restaurant_slug}/menu`}
              className="flex-1 bg-white/15 backdrop-blur-sm text-white text-center py-3.5 rounded-2xl font-semibold text-sm border border-white/30 hover:bg-white/25 transition-colors cursor-pointer"
            >
              View menu
            </Link>
          </div>
        </div>
      </section>

      {/* ── Featured / Best Sellers ── */}
      {featured.length > 0 && (
        <LandingFeatured
          items={featured}
          restaurantSlug={params.restaurant_slug}
          restaurantAcceptsOrders={restaurant.accepts_orders}
          sale={sale}
        />
      )}

      {/* ── Reviews ── */}
      <ReviewsSection
        reviews={reviews}
        average={ratingSummary.average}
        count={ratingSummary.count}
      />

      {/* ── Location & Contact ── */}
      <LocationSection
        restaurant={restaurant}
        restaurantSlug={params.restaurant_slug}
      />
    </div>
    </>
  );
}
