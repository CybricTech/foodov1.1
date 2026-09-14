import type { ExpoConfig, ConfigContext } from "expo/config";
import { existsSync } from "fs";
import { join } from "path";

/**
 * Expo app configuration for the Kitchyn Merchant app.
 *
 * Store-review notes:
 *   - Permissions are kept to what the app actually uses: notifications (new
 *     orders) and the photo library (menu/store images). Plugins that would
 *     otherwise inject camera / microphone / Face ID strings or Android audio
 *     recording + legacy storage permissions are explicitly opted out, and any
 *     stragglers are stripped via `android.blockedPermissions`.
 *   - The UI is light-only, so `userInterfaceStyle` is pinned to "light".
 *
 * Secrets are NEVER hardcoded — they come from `EXPO_PUBLIC_*` env vars at
 * build/runtime (see `.env.example`; EAS builds read them from EAS env vars).
 */

// Accent used for notification tint.
const KITCHYN_PURPLE = "#7B2CBF";
// Background of the app icon artwork — shared by splash + adaptive icon so the
// launch transition is seamless.
const ICON_BACKGROUND = "#440B8C";

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
  version: "1.0.0",
  // "default" lets the OS permit rotation so the frontline Kitchen Display can
  // go landscape. App-wide portrait is then enforced in JS at the router root
  // (app/_layout.tsx locks PORTRAIT_UP), and the frontline orders screen alone
  // unlocks on focus / re-locks on blur. See expo-screen-orientation usage.
  // NOTE: iPad apps that support multitasking ignore orientation locks, so
  // every screen must also lay out correctly in iPad landscape.
  orientation: "default",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  newArchEnabled: true,
  assetBundlePatterns: ["**/*"],
  android: {
    package: "com.kitchyn.merchant",
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      monochromeImage: "./assets/monochrome-icon.png",
      backgroundColor: ICON_BACKGROUND,
    },
    // Push: Android 13+ requires POST_NOTIFICATIONS for runtime prompts.
    permissions: ["POST_NOTIFICATIONS"],
    // Injected by dependencies/templates but never used: the image picker uses
    // the system Photo Picker (no storage permission), and audio is playback
    // only (the new-order chime).
    blockedPermissions: [
      "android.permission.RECORD_AUDIO",
      "android.permission.CAMERA",
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.WRITE_EXTERNAL_STORAGE",
      "android.permission.READ_MEDIA_IMAGES",
      "android.permission.READ_MEDIA_VIDEO",
      "android.permission.SYSTEM_ALERT_WINDOW",
    ],
    // FCM delivers Expo pushes on Android. Only set when the file exists so
    // config evaluation (expo export / tsc) doesn't fail in a fresh clone;
    // the operator must drop google-services.json here before an EAS build.
    ...(hasGoogleServices ? { googleServicesFile: GOOGLE_SERVICES_PATH } : {}),
  },
  ios: {
    bundleIdentifier: "com.kitchyn.merchant",
    supportsTablet: true,
    config: {
      // HTTPS only via the OS networking stack — exempt from export compliance.
      usesNonExemptEncryption: false,
    },
  },
  plugins: [
    "expo-router",
    // Sessions are stored in the keychain without biometrics.
    ["expo-secure-store", { faceIDPermission: false }],
    "expo-font",
    // Playback only (new-order chime) — no recording.
    ["expo-audio", { microphonePermission: false, recordAudioAndroid: false }],
    [
      "expo-notifications",
      {
        // Android status-bar icon must be a white silhouette on transparent.
        icon: "./assets/notification-icon.png",
        color: KITCHYN_PURPLE,
        // Bundle the custom new-order chime so the "orders" channel / iOS alert
        // can use it. Falls back to the system default sound if unsupported.
        // NOTE: filename must be a valid Android resource name ([a-z0-9_], no
        // hyphens) or the expo-notifications prebuild fails.
        sounds: ["./assets/new_order.wav"],
      },
    ],
    [
      "expo-image-picker",
      {
        photosPermission:
          "Kitchyn uses your photo library so you can choose images for your menu items and store profile.",
        cameraPermission: false,
        microphonePermission: false,
      },
    ],
    [
      "expo-splash-screen",
      {
        image: "./assets/splash-icon.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: ICON_BACKGROUND,
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
      // EAS project @amirtalib/kitchyn-merchant (created via `eas init`). The
      // projectId is public (not a secret) and is required at runtime for
      // getExpoPushTokenAsync(). Env var still wins if set.
      projectId: process.env.EAS_PROJECT_ID ?? "fec93db7-9540-42c4-8fd7-79fb44ef7a3c",
    },
  },
});
