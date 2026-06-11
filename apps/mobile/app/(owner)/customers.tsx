/** Owner Customers (reached from "More") — list, search, per-customer history. */
import { useAuth } from "../../src/lib/auth";
import { CustomersScreen } from "../../src/features/owner/customers-screen";

export default function OwnerCustomersRoute() {
  const { profile } = useAuth();
  if (!profile) return null;
  return <CustomersScreen restaurantId={profile.restaurantId} />;
}
