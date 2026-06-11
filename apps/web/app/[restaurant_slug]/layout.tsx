import { notFound } from "next/navigation";
import { getCachedRestaurant } from "@/lib/supabase/storefront-cache";
import { RestaurantProvider } from "@/components/storefront/restaurant-context";
import { CartGuard } from "@/components/storefront/cart-guard";
import { ClosedNotice } from "@/components/storefront/closed-notice";
import { ActiveOrderBanner } from "@/components/storefront/active-order-banner";
import { StorefrontSplash } from "@/components/storefront/storefront-splash";

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
