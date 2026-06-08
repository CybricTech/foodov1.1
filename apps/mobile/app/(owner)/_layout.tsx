/**
 * Owner route group — the full owner app, distinct from the (frontline) staff
 * group. Bottom tabs hold the primary destinations; the rest live behind "More"
 * (mirroring web, which surfaces primary nav items and tucks the overflow away).
 *
 * Primary tabs:  Home · Orders · Wallet · Analytics · More
 * Behind "More": Customers (built), Menu/Marketing/Settings (Phase 2b
 *                placeholders), Frontline mode, Sign out.
 *
 * Guards the group (no merchant profile → /login) and gates it to owners
 * (merchant_staff is bounced to the frontline queue). The ConnectionBanner sits
 * above the tabs so degraded connectivity is always visible.
 */
import { Redirect, Tabs } from "expo-router";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Home,
  ClipboardList,
  Wallet as WalletIcon,
  BarChart3,
  MoreHorizontal,
} from "lucide-react-native";

import { useAuth } from "../../src/lib/auth";
import { ConnectionBanner } from "../../src/components/connection-banner";
import { theme } from "../../src/theme";

export default function OwnerLayout() {
  const { loading, profile } = useAuth();

  if (loading) return null;
  if (!profile) return <Redirect href="/login" />;
  // Staff have no owner dashboard — send them to the frontline queue.
  if (profile.role === "merchant_staff") return <Redirect href="/(frontline)/orders" />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.white }} edges={["top"]}>
      <ConnectionBanner />
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
            tabBarLabelStyle: { fontSize: 11, fontWeight: "700" },
          }}
        >
          <Tabs.Screen
            name="index"
            options={{ title: "Home", tabBarIcon: ({ color, size }) => <Home color={color} size={size ?? 22} /> }}
          />
          <Tabs.Screen
            name="orders"
            options={{ title: "Orders", tabBarIcon: ({ color, size }) => <ClipboardList color={color} size={size ?? 22} /> }}
          />
          <Tabs.Screen
            name="wallet"
            options={{ title: "Wallet", tabBarIcon: ({ color, size }) => <WalletIcon color={color} size={size ?? 22} /> }}
          />
          <Tabs.Screen
            name="analytics"
            options={{ title: "Analytics", tabBarIcon: ({ color, size }) => <BarChart3 color={color} size={size ?? 22} /> }}
          />
          <Tabs.Screen
            name="more"
            options={{ title: "More", tabBarIcon: ({ color, size }) => <MoreHorizontal color={color} size={size ?? 22} /> }}
          />

          {/* Reachable from "More" but not shown as tabs. */}
          <Tabs.Screen name="customers" options={{ href: null }} />
          <Tabs.Screen name="menu" options={{ href: null }} />
          <Tabs.Screen name="marketing" options={{ href: null }} />
          <Tabs.Screen name="settings" options={{ href: null }} />
        </Tabs>
      </View>
    </SafeAreaView>
  );
}
