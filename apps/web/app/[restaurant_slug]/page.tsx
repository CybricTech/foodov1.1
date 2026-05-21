import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Star, Clock, ShoppingBag } from "lucide-react";
import { createServerClient } from "@/lib/supabase/server";
import {
  getRestaurantBySlug,
  getMenuItems,
  getRestaurantReviews,
  getRestaurantRatingSummary,
} from "@foodo/database";
import { LandingFeatured } from "@/components/storefront/landing-featured";
import { ReviewsSection } from "@/components/storefront/reviews-section";
import { LocationSection } from "@/components/storefront/location-section";
import { ActiveOrderBanner } from "@/components/storefront/active-order-banner";
import { StorefrontCTAButtons } from "@/components/storefront/storefront-cta-buttons";

export const revalidate = 60;

interface StorefrontPageProps {
  params: { restaurant_slug: string };
}

export async function generateMetadata({ params }: StorefrontPageProps) {
  const supabase = await createServerClient();
  const restaurant = await getRestaurantBySlug(supabase, params.restaurant_slug);
  if (!restaurant) return {};
  return {
    title: restaurant.name,
    description: restaurant.description ?? `Order from ${restaurant.name}`,
  };
}

export default async function StorefrontPage({ params }: StorefrontPageProps) {
  const supabase = await createServerClient();

  const restaurant = await getRestaurantBySlug(supabase, params.restaurant_slug);
  if (!restaurant) notFound();

  const [items, reviews, ratingSummary] = await Promise.all([
    getMenuItems(supabase, restaurant.id),
    getRestaurantReviews(supabase, restaurant.id),
    getRestaurantRatingSummary(supabase, restaurant.id),
  ]);
  const featured = items.filter((i) => i.is_featured);

  const hasInfoChips =
    ratingSummary.count > 0 ||
    !!restaurant.estimated_delivery_minutes ||
    !!restaurant.min_order_amount;

  return (
    <>
      <ActiveOrderBanner />
    <div className="min-h-screen bg-white">
      {/* ── Hero ── */}
      <section className="relative w-full h-[72vh] min-h-[480px] max-h-[720px]">
        {/* Background */}
        {restaurant.banner_url ? (
          <Image
            src={restaurant.banner_url}
            alt={restaurant.name}
            fill
            className="object-cover"
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
                src={restaurant.logo_url}
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
              {restaurant.estimated_delivery_minutes && (
                <span className="inline-flex items-center gap-1 bg-white/15 backdrop-blur-sm text-white text-xs font-semibold px-2.5 py-1.5 rounded-full border border-white/20">
                  <Clock size={10} />
                  {restaurant.estimated_delivery_minutes} min
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
          <StorefrontCTAButtons
            restaurantSlug={params.restaurant_slug}
            logoUrl={restaurant.logo_url ?? null}
            brandColor={restaurant.primary_color ?? "#2D6A4F"}
            restaurantName={restaurant.name}
            acceptsOrders={restaurant.accepts_orders}
          />
        </div>
      </section>

      {/* ── Featured / Best Sellers ── */}
      {featured.length > 0 && (
        <LandingFeatured
          items={featured}
          restaurantSlug={params.restaurant_slug}
          restaurantAcceptsOrders={restaurant.accepts_orders}
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
