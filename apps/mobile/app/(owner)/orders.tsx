/**
 * Owner Orders tab — reuses the Phase 1 frontline kanban orders screen for now
 * (Phase 2a does NOT rebuild a richer owner queue). Same realtime/dispatch UX.
 */
import { useAuth } from "../../src/lib/auth";
import { OrdersScreen } from "../../src/features/orders/orders-screen";

export default function OwnerOrdersRoute() {
  const { profile } = useAuth();
  if (!profile) return null;
  return <OrdersScreen restaurantId={profile.restaurantId} />;
}
