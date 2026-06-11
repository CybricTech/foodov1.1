/**
 * Owner Home tab — KPI overview for the signed-in restaurant.
 * Profile is guaranteed by the group layout guard.
 */
import { useAuth } from "../../../src/lib/auth";
import { HomeScreen } from "../../../src/features/owner/home-screen";

export default function OwnerHomeRoute() {
  const { profile } = useAuth();
  if (!profile) return null;
  return <HomeScreen restaurantId={profile.restaurantId} />;
}
