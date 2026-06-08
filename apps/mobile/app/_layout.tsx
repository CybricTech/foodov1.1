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
import { SafeAreaProvider } from "react-native-safe-area-context";

import { initObservability } from "../src/lib/observability";
import { AuthProvider } from "../src/lib/auth";
import { ConnectionProvider } from "../src/lib/connection";
import { theme } from "../src/theme";

export default function RootLayout() {
  useEffect(() => {
    initObservability();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" backgroundColor={theme.colors.brand} />
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
