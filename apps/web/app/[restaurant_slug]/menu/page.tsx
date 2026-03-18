import Image from "next/image";
import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import {
  getRestaurantBySlug,
  getMenuCategories,
  getMenuItems,
} from "@foodo/database";
import { CategoryTabs } from "@/components/storefront/category-tabs";
import { MenuSections } from "@/components/storefront/menu-sections";

export const revalidate = 60;

interface MenuPageProps {
  params: { restaurant_slug: string };
}

export async function generateMetadata({ params }: MenuPageProps) {
  const supabase = await createServerClient();
  const restaurant = await getRestaurantBySlug(supabase, params.restaurant_slug);
  if (!restaurant) return {};
  return {
    title: `Menu — ${restaurant.name}`,
    description: restaurant.description ?? `Order from ${restaurant.name}`,
  };
}

export default async function MenuPage({ params }: MenuPageProps) {
  const supabase = await createServerClient();

  const restaurant = await getRestaurantBySlug(supabase, params.restaurant_slug);
  if (!restaurant) notFound();

  const [categories, items] = await Promise.all([
    getMenuCategories(supabase, restaurant.id),
    getMenuItems(supabase, restaurant.id),
  ]);

  return (
    <div className="pb-24">
      {/* Banner + header */}
      <div className="relative">
        {restaurant.banner_url ? (
          <div className="relative w-full h-48">
            <Image
              src={restaurant.banner_url}
              alt={`${restaurant.name} banner`}
              fill
              className="object-cover"
              sizes="100vw"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black-900/60 to-transparent" />
          </div>
        ) : (
          <div className="w-full h-32 bg-primary/20" />
        )}

        {/* Restaurant info card */}
        <div className="px-4 -mt-8 relative">
          <div className="bg-white rounded-2xl shadow-md p-4 flex gap-4 items-start">
            {restaurant.logo_url && (
              <div className="relative w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 border border-black-100">
                <Image
                  src={restaurant.logo_url}
                  alt={restaurant.name}
                  fill
                  className="object-cover"
                  sizes="64px"
                />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold text-black-900 leading-tight">
                {restaurant.name}
              </h1>
              {restaurant.description && (
                <p className="text-sm text-black-400 mt-0.5 line-clamp-2">
                  {restaurant.description}
                </p>
              )}
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                {restaurant.estimated_delivery_minutes && (
                  <span className="text-xs text-black-500 flex items-center gap-1">
                    ⏱ {restaurant.estimated_delivery_minutes} min
                  </span>
                )}
                {restaurant.min_order_amount && (
                  <span className="text-xs text-black-500">
                    Min ₦{(restaurant.min_order_amount / 100).toFixed(0)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Closed banner */}
      {!restaurant.accepts_orders && (
        <div className="mx-4 mt-4 bg-cinnabar-100 text-cinnabar-500 text-sm font-medium px-4 py-3 rounded-xl text-center">
          We&apos;re currently closed — check back soon!
        </div>
      )}

      {/* Category sticky tabs */}
      {categories.length > 0 && (
        <div className="mt-4">
          <CategoryTabs categories={categories} />
        </div>
      )}

      {/* Menu sections */}
      <div className="mt-4 px-4">
        <MenuSections
          categories={categories}
          items={items}
          restaurantAcceptsOrders={restaurant.accepts_orders}
        />
      </div>
    </div>
  );
}
