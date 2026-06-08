/**
 * Owner bottom tabs — the primary destinations (Home · Orders · Wallet ·
 * Analytics · More). Nested inside the (owner) STACK so that secondary screens
 * (Customers/Menu/Marketing/Settings) reached from "More" push ON TOP of these
 * tabs with a back affordance + native swipe-back gesture, instead of silently
 * swapping tab content with no way back.
 *
 * Auth guarding lives in the parent (owner) stack layout, so this file only
 * configures the tab bar. The ConnectionBanner sits above the tabs so degraded
 * connectivity is always visible.
 */
import { Tabs } from "expo-router";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Home,
  ClipboardList,
  Wallet as WalletIcon,
  BarChart3,
  MoreHorizontal,
} from "lucide-react-native";

import { ConnectionBanner } from "../../../src/components/connection-banner";
import { theme } from "../../../src/theme";

export default function OwnerTabsLayout() {
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
        </Tabs>
      </View>
    </SafeAreaView>
  );
}
