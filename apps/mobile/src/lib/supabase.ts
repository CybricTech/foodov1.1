/**
 * Supabase client for the Kitchyn Merchant app.
 *
 * - Reuses the SHARED `createMobileClient` factory from `@foodo/database`, which
 *   is purpose-built for Expo (accepts a SupportedStorage and enables session
 *   persistence + auto-refresh). This keeps the client config aligned with web.
 * - Session tokens are persisted in the OS secure store via SecureStoreAdapter.
 * - Realtime is enabled out of the box by supabase-js; we expose a tiny helper
 *   to scope a per-restaurant channel (the same pattern the web frontline uses).
 * - If Supabase config is missing, we return `null` and let the UI render a
 *   "not configured" state instead of crashing on boot.
 *
 * IMPORTANT: `react-native-url-polyfill/auto` MUST be imported before any
 * supabase-js network call so URL parsing works in the RN runtime. We import it
 * at the top of the app entry (see app/_layout.tsx) AND here defensively.
 */
import "react-native-url-polyfill/auto";
import { AppState } from "react-native";
import { createMobileClient, type TypedSupabaseClient } from "@foodo/database";

import { env, hasSupabaseConfig } from "./env";
import { SecureStoreAdapter } from "./secure-store-adapter";

let _client: TypedSupabaseClient | null = null;
let _appStateBound = false;

/**
 * Returns the singleton Supabase client, or `null` if env config is absent.
 */
export function getSupabase(): TypedSupabaseClient | null {
  if (!hasSupabaseConfig) return null;
  if (_client) return _client;

  // createMobileClient reads EXPO_PUBLIC_* internally; we also ensure the env
  // is present (guarded above) so it won't throw.
  _client = createMobileClient(SecureStoreAdapter);

  // Drive token auto-refresh by foreground/background, per supabase-js RN guide.
  if (!_appStateBound) {
    _appStateBound = true;
    AppState.addEventListener("change", (state) => {
      if (!_client) return;
      if (state === "active") {
        _client.auth.startAutoRefresh();
      } else {
        _client.auth.stopAutoRefresh();
      }
    });
  }

  return _client;
}

/** Convenience flag re-exported for UI connectivity checks. */
export const isSupabaseConfigured = hasSupabaseConfig;

/** App environment label (development | preview | production). */
export const appEnv = env.appEnv;
