/**
 * Menu tab — availability toggles for the signed-in restaurant. Its header
 * "Account" button opens the shared Account & help screen (support, legal,
 * delete account, sign out) — staff have no More tab.
 */
import { router } from "expo-router";

import { useAuth } from "../../src/lib/auth";
import { MenuScreen } from "../../src/features/menu/menu-screen";

export default function MenuRoute() {
  const { profile } = useAuth();
  if (!profile) return null;

  return (
    <MenuScreen
      restaurantId={profile.restaurantId}
      accountName={profile.fullName || profile.email}
      onOpenAccount={() => router.push("/account")}
    />
  );
}
