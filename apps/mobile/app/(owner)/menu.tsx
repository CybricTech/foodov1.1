/** Owner Menu (reached from "More") — full menu manager (categories + items). */
import { useAuth } from "../../src/lib/auth";
import { MenuManagerScreen } from "../../src/features/menu-manager/menu-manager-screen";

export default function OwnerMenuRoute() {
  const { profile } = useAuth();
  if (!profile) return null;
  return <MenuManagerScreen restaurantId={profile.restaurantId} />;
}
