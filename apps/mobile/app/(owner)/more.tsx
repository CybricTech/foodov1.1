/**
 * Owner "More" tab — overflow hub. Routes to the in-group secondary screens
 * (Customers built; Menu/Marketing/Settings placeholders), into Frontline mode
 * (the existing (frontline) staff group), and handles sign-out.
 */
import { router } from "expo-router";

import { useAuth } from "../../src/lib/auth";
import { MoreScreen } from "../../src/features/owner/more-screen";

export default function OwnerMoreRoute() {
  const { profile, signOut } = useAuth();
  if (!profile) return null;

  return (
    <MoreScreen
      accountName={profile.fullName || profile.email}
      onOpenCustomers={() => router.push("/(owner)/customers")}
      onOpenMenu={() => router.push("/(owner)/menu")}
      onOpenMarketing={() => router.push("/(owner)/marketing")}
      onOpenSettings={() => router.push("/(owner)/settings")}
      onEnterFrontline={() => router.push("/(frontline)/orders")}
      onSignOut={async () => {
        await signOut();
        router.replace("/login");
      }}
    />
  );
}
