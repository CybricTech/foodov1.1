/** Owner Analytics tab — charts + KPIs for the signed-in restaurant. */
import { useAuth } from "../../../src/lib/auth";
import { AnalyticsScreen } from "../../../src/features/owner/analytics-screen";

export default function OwnerAnalyticsRoute() {
  const { profile } = useAuth();
  if (!profile) return null;
  return <AnalyticsScreen restaurantId={profile.restaurantId} />;
}
