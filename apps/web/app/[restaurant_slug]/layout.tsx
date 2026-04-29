import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { getRestaurantBySlug } from "@foodo/database";
import { RestaurantProvider } from "@/components/storefront/restaurant-context";
import { CartGuard } from "@/components/storefront/cart-guard";
import { ClosedNotice } from "@/components/storefront/closed-notice";
import { ActiveOrderBanner } from "@/components/storefront/active-order-banner";

export default async function StorefrontLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { restaurant_slug: string };
}) {
  const supabase = await createServerClient();
  const restaurant = await getRestaurantBySlug(supabase, params.restaurant_slug);

  if (!restaurant) notFound();

  const brandColor = restaurant.primary_color ?? "#2D6A4F";

  return (
    <div
      style={{ "--brand-color": brandColor } as React.CSSProperties}
      className="min-h-screen bg-black-50"
    >
      <RestaurantProvider restaurant={restaurant}>
        <ActiveOrderBanner />
        <ClosedNotice />
        <CartGuard />
        {children}
      </RestaurantProvider>
    </div>
  );
}
