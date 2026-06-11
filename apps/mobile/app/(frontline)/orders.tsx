/**
 * Orders tab — renders the kanban orders screen for the signed-in restaurant.
 * Profile is guaranteed by the group layout guard; this just wires restaurantId.
 */
import { useAuth } from "../../src/lib/auth";
import { OrdersScreen } from "../../src/features/orders/orders-screen";

export default function OrdersRoute() {
  const { profile } = useAuth();
  if (!profile) return null;
  return <OrdersScreen restaurantId={profile.restaurantId} />;
}
