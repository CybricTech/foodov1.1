/**
 * Menu tab — availability toggles for the signed-in restaurant. Also hosts the
 * sign-out control (Phase 1 has no settings screen yet). On sign out the auth
 * context clears `profile`, which the index/group guard turns into a redirect
 * back to /login.
 */
import { router } from "expo-router";

import { useAuth } from "../../src/lib/auth";
import { MenuScreen } from "../../src/features/menu/menu-screen";

export default function MenuRoute() {
  const { profile, signOut } = useAuth();
  if (!profile) return null;

  return (
    <MenuScreen
      restaurantId={profile.restaurantId}
      accountName={profile.fullName || profile.email}
      onSignOut={async () => {
        await signOut();
        router.replace("/login");
      }}
    />
  );
}
