/**
 * Root layout for the Kitchyn Merchant app.
 *
 * - `react-native-url-polyfill/auto` MUST be the first import so supabase-js URL
 *   parsing works in the RN runtime.
 * - Initializes observability (Sentry + PostHog) once at boot — guarded on env.
 * - Wraps the whole router stack in:
 *     SafeAreaProvider → AuthProvider → ConnectionProvider
 *   so every screen can read the session/profile and connection status.
 *
 * Phase 1: auth-gated entry (index redirects), a login route, and the frontline
 * route group ((frontline) bottom tabs: Orders, Menu).
 */
import "react-native-url-polyfill/auto";
import "../global.css";

import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { initObservability } from "../src/lib/observability";
import { initPushHandlers } from "../src/lib/push";
import { AuthProvider } from "../src/lib/auth";
import { ConnectionProvider } from "../src/lib/connection";
import { useBrandFonts, applyBrandFontPatch } from "../src/lib/fonts";
import { theme } from "../src/theme";

// Patch RN's <Text>/<TextInput> defaults once at module eval so the brand
// fontFamily is injected globally based on each element's fontWeight. Idempotent
// + crash-guarded (see src/lib/fonts.ts).
applyBrandFontPatch();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useBrandFonts();

  useEffect(() => {
    initObservability();
    // Mount the notification presentation + tap-response handlers once. No-ops
    // safely when the notifications module is unavailable (e.g. web).
    initPushHandlers();
  }, []);

  // Gate the app shell on font load so brand typography is in place before the
  // first paint — no flash of system-font text that later restyles. If fonts
  // fail to load we proceed anyway (system font) rather than hang forever.
  if (!fontsLoaded && !fontError) {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" backgroundColor={theme.colors.brand} />
        <View
          style={{
            flex: 1,
            backgroundColor: theme.colors.brand,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: "#fff", fontSize: 28, fontWeight: "800", marginBottom: 16 }}>
            Kitchyn
          </Text>
          <ActivityIndicator color="#fff" />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      {/* App screens are predominantly white, so the OS status bar (battery,
          clock, signal) needs DARK text to be visible. The purple splash above
          keeps light text. */}
      <StatusBar style="dark" backgroundColor={theme.colors.white} />
      <AuthProvider>
        <ConnectionProvider>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: theme.colors.background },
            }}
          />
        </ConnectionProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
