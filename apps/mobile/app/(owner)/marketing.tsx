/**
 * Owner Marketing (reached from "More") — offers + loyalty. The discounts list
 * and loyalty config load inside the screen, scoped to the owner's restaurant.
 */
import { useAuth } from "../../src/lib/auth";
import { MarketingScreen } from "../../src/features/marketing/marketing-screen";

export default function OwnerMarketingRoute() {
  const { profile } = useAuth();
  const restaurantId = profile?.restaurantId;

  if (!restaurantId) return null;

  return <MarketingScreen restaurantId={restaurantId} />;
}
