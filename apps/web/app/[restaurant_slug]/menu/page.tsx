import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock, ShoppingBag, ArrowLeft } from "lucide-react";
import { getCachedRestaurant, getCachedMenu } from "@/lib/supabase/storefront-cache";
import { transformImage } from "@/lib/images";
import { CategoryTabs } from "@/components/storefront/category-tabs";
import { MenuSections } from "@/components/storefront/menu-sections";
import { getActiveMenuSale } from "@/lib/discounts";

export const revalidate = 60;

interface MenuPageProps {
  params: { restaurant_slug: string };
}

export async function generateMetadata({ params }: MenuPageProps) {
  const restaurant = await getCachedRestaurant(params.restaurant_slug);
  if (!restaurant) return {};
  return {
    title: `Menu — ${restaurant.name}`,
    description: restaurant.description ?? `Order from ${restaurant.name}`,
  };
}

export default async function MenuPage({ params }: MenuPageProps) {
  const restaurant = await getCachedRestaurant(params.restaurant_slug);
  if (!restaurant) notFound();

  const [menu, sale] = await Promise.all([
    getCachedMenu(restaurant.id, true),
    getActiveMenuSale(restaurant.id),
  ]);
  const { categories, items } = menu;

  return (
    <div className="pb-24 bg-white min-h-screen">
      {/* Banner */}
      <div className="relative">
        {restaurant.banner_url ? (
          <div className="relative w-full h-48">
            <Image
              src={transformImage(restaurant.banner_url, { width: 720, height: 192, quality: 75 })}
              alt={`${restaurant.name} banner`}
              fill
              className="object-cover"
              sizes="100vw"
              priority
              unoptimized
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-black/10" />
          </div>
        ) : (
          <div className="w-full h-32 bg-gradient-to-br from-primary/25 to-primary/10" />
        )}

        {/* Back button */}
        <div className="absolute top-4 left-4">
          <Link
            href={`/${params.restaurant_slug}`}
            className="w-9 h-9 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/40 transition-colors cursor-pointer"
            aria-label="Back"
          >
            <ArrowLeft size={16} />
          </Link>
        </div>
      </div>

      {/* Restaurant info card */}
      <div className="px-4 -mt-8 relative z-10">
        <div className="bg-white rounded-2xl shadow-lg p-4 flex gap-3 items-start">
          {restaurant.logo_url && (
            <div className="relative w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 border border-black-100">
              <Image
                src={transformImage(restaurant.logo_url, { width: 56, height: 56 })}
                alt={restaurant.name}
                fill
                className="object-cover"
                sizes="56px"
                unoptimized
              />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold text-black-900 leading-tight">
              {restaurant.name}
            </h1>
            {restaurant.description && (
              <p className="text-xs text-black-400 mt-0.5 line-clamp-2 leading-relaxed">
                {restaurant.description}
              </p>
            )}
            {(restaurant.estimated_delivery_minutes || restaurant.min_order_amount) && (
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                {restaurant.estimated_delivery_minutes && (
                  <span className="flex items-center gap-1 text-xs text-black-500 font-medium">
                    <Clock size={11} className="text-black-400" />
                    {restaurant.estimated_delivery_minutes} min
                  </span>
                )}
                {restaurant.min_order_amount && (
                  <span className="flex items-center gap-1 text-xs text-black-500 font-medium">
                    <ShoppingBag size={11} className="text-black-400" />
                    Min ₦{(restaurant.min_order_amount / 100).toLocaleString()}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Closed banner */}
      {!restaurant.accepts_orders && (
        <div className="mx-4 mt-4 bg-cinnabar-50 border border-cinnabar-200 text-cinnabar-600 text-sm font-medium px-4 py-3 rounded-xl text-center">
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
          sale={sale}
        />
      </div>
    </div>
  );
}
