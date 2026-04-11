import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
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

  return (
    <div className="min-h-screen">
      {/* ── Hero ── */}
      <section className="relative w-full h-[65vh] min-h-[420px] max-h-[640px]">
        {restaurant.banner_url ? (
          <Image
            src={restaurant.banner_url}
            alt={`${restaurant.name}`}
            fill
            className="object-cover"
            sizes="100vw"
            quality={90}
            priority
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary to-primary/70" />
        )}

        {/* Dark gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 mt-20 to-transparent" />

        {/* Top Navbar overlay */}
        <div className="absolute top-0 inset-x-0 z-20 flex justify-between items-center p-4 md:px-6 md:py-5 bg-gradient-to-b from-black/60 to-transparent">
          {restaurant.logo_url ? (
            <div className="relative w-16 h-16 md:w-20 md:h-20 rounded-full overflow-hidden border-[3px] border-white shadow-xl bg-white flex-shrink-0">
              <Image
                src={restaurant.logo_url}
                alt={`${restaurant.name} logo`}
                fill
                className="object-cover"
              />
            </div>
          ) : (
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-primary flex items-center justify-center border-[3px] border-white shadow-xl flex-shrink-0">
              <span className="text-white font-bold text-2xl drop-shadow-sm">{restaurant.name.charAt(0)}</span>
            </div>
          )}
        </div>

        {/* Hero text */}
        <div className="absolute bottom-0 left-0 right-0 px-6 pb-8">
          {restaurant.description && (
            <p className="text-white/75 text-sm font-semibold mb-2 tracking-wide">
              {restaurant.description}
            </p>
          )}
          <h1 className="text-white text-[2rem] font-extrabold leading-tight tracking-tight">
            {restaurant.name}
          </h1>

          {/* CTA buttons */}
          <div className="mt-5 flex gap-3">
            <Link
              href={`/${params.restaurant_slug}/menu`}
              className="bg-primary text-white px-6 py-3 rounded-2xl font-semibold text-sm hover:opacity-90 transition-opacity"
            >
              Order now
            </Link>
            <Link
              href={`/${params.restaurant_slug}/menu`}
              className="bg-white/15 backdrop-blur-sm text-white px-6 py-3 rounded-2xl font-semibold text-sm border border-white/30 hover:bg-white/25 transition-colors"
            >
              View menu
            </Link>
          </div>
        </div>
      </section>

      {/* Closed banner */}
      {!restaurant.accepts_orders && (
        <div className="mx-4 mt-4 bg-cinnabar-100 text-cinnabar-500 text-sm font-medium px-4 py-3 rounded-xl text-center">
          We&apos;re currently closed — check back soon!
        </div>
      )}

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
