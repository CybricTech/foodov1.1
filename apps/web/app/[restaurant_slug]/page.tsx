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
            quality={90}
            priority
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/90 via-primary/70 to-black/80" />
        )}

        {/* Gradient layers — bottom-heavy for text legibility */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-black/40" />

        {/* Top bar — logo */}
        <div className="absolute top-0 inset-x-0 z-20 px-5 pt-5">
          {restaurant.logo_url ? (
            <div className="relative w-14 h-14 rounded-2xl overflow-hidden border-2 border-white/30 shadow-xl bg-white flex-shrink-0">
              <Image
                src={restaurant.logo_url}
                alt={`${restaurant.name} logo`}
                fill
                className="object-cover"
              />
            </div>
          ) : (
            <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center shadow-xl">
              <span className="text-white font-bold text-xl">
                {restaurant.name.charAt(0)}
              </span>
            </div>
          )}
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

          {/* Description */}
          {restaurant.description && (
            <p className="text-white/75 text-sm font-medium leading-relaxed line-clamp-2">
              {restaurant.description}
            </p>
          )}

          {/* Restaurant name */}
          <h1 className="text-white text-[2.15rem] font-extrabold leading-tight tracking-tight">
            {restaurant.name}
          </h1>

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
  );
}
