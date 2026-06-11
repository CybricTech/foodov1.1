/**
 * Owner area — a STACK that hosts the bottom-tab group plus the secondary
 * screens reached from "More" (Customers / Menu / Marketing / Settings).
 *
 * Why a stack: the secondary screens are now PUSHED on top of the tabs, which
 * gives them (a) the native iOS/Android swipe-from-edge back gesture for free
 * and (b) a back affordance — instead of the old setup where they were hidden
 * tabs you switched into with no way back.
 *
 * Headers are off here because each screen renders its own branded header (we
 * inject a minimal back chevron into those). The swipe-back gesture works
 * regardless of header visibility. Auth guarding lives here so it covers both
 * the tabs and every pushed screen.
 */
import { Platform } from "react-native";
import { Redirect, Stack } from "expo-router";

import { useAuth } from "../../src/lib/auth";

export default function OwnerLayout() {
  const { loading, profile } = useAuth();

  if (loading) return null;
  if (!profile) return <Redirect href="/login" />;
  // Staff have no owner dashboard — send them to the frontline queue.
  if (profile.role === "merchant_staff") return <Redirect href="/(frontline)/orders" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: true,
        // Android: allow the swipe-back to start from anywhere on the screen,
        // not just the very edge (closer to the iOS / Instagram feel).
        ...(Platform.OS === "android" ? { fullScreenGestureEnabled: true } : null),
      }}
    >
      {/* The bottom-tab group — the area's home. No card animation. */}
      <Stack.Screen name="(tabs)" />
      {/* Secondary screens push over the tabs with a swipe-back gesture. */}
      <Stack.Screen name="customers" />
      <Stack.Screen name="menu" />
      <Stack.Screen name="marketing" />
      <Stack.Screen name="settings" />
    </Stack>
  );
}
