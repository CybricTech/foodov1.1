/**
 * Centralized, typed access to public runtime config.
 *
 * Values resolve from `EXPO_PUBLIC_*` env vars first (inlined by Expo at build
 * time), falling back to `expo-constants` `extra` (set in app.config.ts). All
 * are treated as optional so a missing value degrades gracefully rather than
 * crashing the app on boot (observability + supabase guard on this).
 */
import Constants from "expo-constants";

type Extra = {
  supabaseUrl?: string | null;
  supabaseAnonKey?: string | null;
  sentryDsn?: string | null;
  posthogApiKey?: string | null;
  posthogHost?: string | null;
  appEnv?: string | null;
  apiBaseUrl?: string | null;
};

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

function pick(envValue: string | undefined, extraValue: string | null | undefined): string | null {
  if (envValue && envValue.length > 0) return envValue;
  if (extraValue && extraValue.length > 0) return extraValue;
  return null;
}

export const env = {
  supabaseUrl: pick(process.env.EXPO_PUBLIC_SUPABASE_URL, extra.supabaseUrl),
  supabaseAnonKey: pick(
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    extra.supabaseAnonKey
  ),
  sentryDsn: pick(process.env.EXPO_PUBLIC_SENTRY_DSN, extra.sentryDsn),
  posthogApiKey: pick(process.env.EXPO_PUBLIC_POSTHOG_KEY, extra.posthogApiKey),
  posthogHost:
    pick(process.env.EXPO_PUBLIC_POSTHOG_HOST, extra.posthogHost) ??
    "https://eu.i.posthog.com",
  appEnv:
    pick(process.env.EXPO_PUBLIC_APP_ENV, extra.appEnv) ?? "development",
  /**
   * Origin of the web app whose dashboard API routes the mobile app calls
   * (e.g. the Vercel URL in prod, or http://<lan-ip>:3000 in dev). Used for the
   * order status + dispatch endpoints, which authenticate via Bearer token.
   */
  apiBaseUrl: pick(process.env.EXPO_PUBLIC_API_BASE_URL, extra.apiBaseUrl),
} as const;

/** True only when both Supabase values are present. */
export const hasSupabaseConfig = Boolean(env.supabaseUrl && env.supabaseAnonKey);

/** True when the dashboard API base URL is configured (status/dispatch calls). */
export const hasApiConfig = Boolean(env.apiBaseUrl);
