/**
 * Push notifications for the Kitchyn Merchant app (Expo Push service).
 *
 * Flow:
 *   1. After login, `registerForPushNotifications()` asks permission, gets the
 *      device's Expo push token, and POSTs it to the web app
 *      (`/api/merchant/notifications/register`) so the backend can fan new-order
 *      alerts to this device via Expo. On logout we unregister.
 *   2. `initPushHandlers()` (called once from the root layout) sets the
 *      foreground presentation behavior (banner + sound) and wires a tap handler
 *      that routes to the orders queue.
 *
 * EXPO GO SAFETY: every native call here is wrapped. In Expo Go (SDK 53+) the
 * remote push token API is unavailable and `getExpoPushTokenAsync` throws — we
 * CATCH and no-op with a warn so the app still runs for non-push testing. A
 * missing native module (e.g. running on web) is likewise swallowed.
 */
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";

import { registerPushToken, unregisterPushToken } from "./api";

const ANDROID_CHANNEL_ID = "orders";

/** Foreground notifications show a banner + play sound (set once at init). */
let _handlerSet = false;
let _responseSub: Notifications.Subscription | null = null;

/**
 * Resolve the EAS projectId — required by getExpoPushTokenAsync. Comes from
 * app.config.ts `extra.eas.projectId` (set via the EAS_PROJECT_ID env var).
 */
function getProjectId(): string | null {
  const extra = Constants.expoConfig?.extra as
    | { eas?: { projectId?: string } }
    | undefined;
  return extra?.eas?.projectId ?? null;
}

/** Create the high-importance Android "orders" channel (sound + heads-up). */
async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: "New orders",
      importance: Notifications.AndroidImportance.MAX,
      sound: "default",
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#7B2CBF",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  } catch (e) {
    console.warn("[push] failed to create Android channel:", e);
  }
}

/**
 * Request permission + obtain this device's Expo push token, then register it
 * with the backend. Returns the token, or null when push is unavailable
 * (simulator, Expo Go, denied permission, no projectId). Safe to call on every
 * login — the backend upserts on the token.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  // Push tokens only exist on physical devices.
  if (!Device.isDevice) {
    console.warn("[push] not a physical device — skipping push registration");
    return null;
  }

  try {
    await ensureAndroidChannel();

    // Android 13+ requires a runtime POST_NOTIFICATIONS grant; iOS prompts here.
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== "granted") {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== "granted") {
      console.warn("[push] notification permission not granted");
      return null;
    }

    const projectId = getProjectId();
    if (!projectId) {
      console.warn("[push] no EAS projectId — cannot fetch Expo push token");
      return null;
    }

    // THROWS in Expo Go (remote notifications removed) — caught below.
    const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenResponse.data;
    if (!token) return null;

    try {
      await registerPushToken(token, Platform.OS);
    } catch (e) {
      // Backend registration failure must never block auth.
      console.warn("[push] backend token registration failed:", e);
    }

    return token;
  } catch (e) {
    // Expo Go / missing native module / no APNs — degrade gracefully.
    console.warn("[push] registerForPushNotifications unavailable:", e);
    return null;
  }
}

/**
 * Unregister this device's token from the backend (called on logout, BEFORE the
 * session is cleared so the Bearer token is still valid). Best-effort.
 */
export async function unregisterForPushNotifications(): Promise<void> {
  try {
    if (!Device.isDevice) return;
    const projectId = getProjectId();
    if (!projectId) return;
    const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenResponse.data;
    if (!token) return;
    await unregisterPushToken(token).catch((e) =>
      console.warn("[push] backend unregister failed:", e)
    );
  } catch (e) {
    console.warn("[push] unregisterForPushNotifications unavailable:", e);
  }
}

/**
 * Route to the orders queue when a notification carrying an orderId is tapped.
 * Owner + staff both land on an "orders" route; expo-router resolves the right
 * group from the current auth-gated stack.
 */
function handleNotificationResponse(
  response: Notifications.NotificationResponse
): void {
  const data = response.notification.request.content.data as
    | { orderId?: string }
    | undefined;
  if (!data?.orderId) return;
  try {
    // Both the owner tabs and the frontline group expose an "orders" screen.
    router.push("/orders" as never);
  } catch (e) {
    console.warn("[push] navigation on tap failed:", e);
  }
}

/**
 * Mount the foreground handler + tap-response listener once. Call from the root
 * layout. No-ops safely if the notifications module is unavailable.
 */
export function initPushHandlers(): void {
  if (_handlerSet) return;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });

    _responseSub = Notifications.addNotificationResponseReceivedListener(
      handleNotificationResponse
    );
    _handlerSet = true;
  } catch (e) {
    console.warn("[push] initPushHandlers unavailable:", e);
  }
}

/** Tear down the response listener (optional — app lifetime usually keeps it). */
export function teardownPushHandlers(): void {
  _responseSub?.remove();
  _responseSub = null;
  _handlerSet = false;
}
