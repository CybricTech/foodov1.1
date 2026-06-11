/**
 * Frontline route group — bottom tabs (Orders, Menu) for kitchen/counter staff.
 *
 * - Guards the group: a user without a merchant profile is bounced to /login
 *   (covers deep links + token expiry while inside the group).
 * - Renders the ConnectionBanner ABOVE the tabs so degraded connectivity is
 *   always visible regardless of the active tab.
 * - Brand-themed tab bar; large labels for one-handed use.
 *
 * Both merchant_owner and merchant_staff can use this group. Phase 2a routes
 * staff here by default and owners into the (owner) dashboard; an owner who
 * drops into Frontline mode (via the owner "More" tab) sees a "Return to
 * Dashboard" bar at the top to jump back.
 */
import { Redirect, router, Tabs } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ClipboardList, UtensilsCrossed } from "lucide-react-native";

import { useAuth } from "../../src/lib/auth";
import { ConnectionBanner } from "../../src/components/connection-banner";
import { theme } from "../../src/theme";

export default function FrontlineLayout() {
  const { loading, profile } = useAuth();

  if (loading) return null;
  if (!profile) return <Redirect href="/login" />;

  const isOwner = profile.role === "merchant_owner";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.white }} edges={["top"]}>
      <ConnectionBanner />
      {isOwner && (
        <Pressable
          onPress={() => router.replace("/(owner)")}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            backgroundColor: theme.colors.primary[50],
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.black[100],
            paddingHorizontal: 16,
            paddingVertical: 10,
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: "700", color: theme.colors.brand }}>
            ‹ Return to Dashboard
          </Text>
        </Pressable>
      )}
      <View style={{ flex: 1 }}>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: theme.colors.brand,
            tabBarInactiveTintColor: theme.colors.black[400],
            tabBarStyle: {
              backgroundColor: theme.colors.white,
              borderTopColor: theme.colors.black[100],
            },
            tabBarLabelStyle: { fontSize: 12, fontWeight: "700" },
          }}
        >
          <Tabs.Screen
            name="orders"
            options={{
              title: "Orders",
              tabBarIcon: ({ color, size }) => <ClipboardList color={color} size={size ?? 22} />,
            }}
          />
          <Tabs.Screen
            name="menu"
            options={{
              title: "Menu",
              tabBarIcon: ({ color, size }) => <UtensilsCrossed color={color} size={size ?? 22} />,
            }}
          />
        </Tabs>
      </View>
    </SafeAreaView>
  );
}
