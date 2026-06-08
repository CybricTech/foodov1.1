import type { ExpoConfig, ConfigContext } from "expo/config";
import { existsSync } from "fs";
import { join } from "path";

/**
 * Expo app configuration for the Kitchyn Merchant app.
 *
 * Phase 0: app identity, Android package id, brand splash/icon, Expo Router +
 * NativeWind plugins, and Sentry/PostHog env placeholders wired through `extra`.
 * Permissions are kept MINIMAL — POST_NOTIFICATIONS / FCM are deferred to
 * Phase 1 (push). Do not add them here yet.
 *
 * Secrets are NEVER hardcoded — they come from `EXPO_PUBLIC_*` env vars at
 * build/runtime (see `.env.example`).
 */

const KITCHYN_PURPLE = "#7B2CBF";

// Firebase config for Android FCM (delivery of Expo pushes on Android). The
// file is provided out-of-band by the build operator and is REQUIRED for a real
// Android build, but absent in a fresh clone. We only reference it when present
// so `expo export` / config evaluation still work for local verification without
// it — when missing, document: drop google-services.json here before EAS build.
const GOOGLE_SERVICES_PATH = "./google-services.json";
const hasGoogleServices = existsSync(join(__dirname, "google-services.json"));

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Kitchyn Merchant",
  slug: "kitchyn-merchant",
  scheme: "kitchyn",
  version: "0.1.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  splash: {
    image: "./assets/splash.png",
    resizeMode: "contain",
    backgroundColor: KITCHYN_PURPLE,
  },
  assetBundlePatterns: ["**/*"],
  android: {
    package: "com.kitchyn.merchant",
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: KITCHYN_PURPLE,
    },
    // Push: Android 13+ requires POST_NOTIFICATIONS for runtime prompts.
    permissions: ["POST_NOTIFICATIONS"],
    // FCM delivers Expo pushes on Android. Only set when the file exists so
    // config evaluation (expo export / tsc) doesn't fail in a fresh clone;
    // the operator must drop google-services.json here before an EAS build.
    ...(hasGoogleServices ? { googleServicesFile: GOOGLE_SERVICES_PATH } : {}),
  },
  ios: {
    bundleIdentifier: "com.kitchyn.merchant",
    supportsTablet: true,
    infoPlist: {
      // Required so the menu manager can pick item photos from the library.
      NSPhotoLibraryUsageDescription:
        "Kitchyn needs access to your photos so you can add images to your menu items.",
    },
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-font",
    "expo-audio",
    [
      "expo-notifications",
      {
        // Monochrome status-bar icon + brand purple accent (Android).
        icon: "./assets/icon.png",
        color: KITCHYN_PURPLE,
        // Bundle the custom new-order chime so the "orders" channel / iOS alert
        // can use it. Falls back to the system default sound if unsupported.
        sounds: ["./assets/new-order.wav"],
      },
    ],
    [
      "expo-image-picker",
      {
        photosPermission:
          "Kitchyn needs access to your photos so you can add images to your menu items.",
      },
    ],
    [
      "expo-splash-screen",
      {
        image: "./assets/splash.png",
        resizeMode: "contain",
        backgroundColor: KITCHYN_PURPLE,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    // Public, non-secret runtime config. Real values are injected via
    // EXPO_PUBLIC_* env vars; these `extra` mirrors give a typed fallback path.
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? null,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? null,
    sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? null,
    posthogApiKey: process.env.EXPO_PUBLIC_POSTHOG_KEY ?? null,
    posthogHost:
      process.env.EXPO_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com",
    appEnv: process.env.EXPO_PUBLIC_APP_ENV ?? "development",
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? null,
    eas: {
      // Filled in by `eas init` (do not invent a real project id here).
      projectId: process.env.EAS_PROJECT_ID ?? undefined,
    },
  },
});
