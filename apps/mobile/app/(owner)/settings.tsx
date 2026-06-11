/** Owner Settings (reached from "More") — full store settings at web parity. */
import { useAuth } from "../../src/lib/auth";
import { SettingsScreen } from "../../src/features/settings/settings-screen";

export default function OwnerSettingsRoute() {
  const { profile } = useAuth();
  if (!profile) return null;
  return <SettingsScreen restaurantId={profile.restaurantId} />;
}
