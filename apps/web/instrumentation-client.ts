import * as Sentry from "@sentry/nextjs";

const isProd = process.env.NEXT_PUBLIC_APP_ENV === "production";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_APP_ENV ?? "development",
  tracesSampleRate: isProd ? 0.2 : 1.0,
  enableLogs: true,
  sendDefaultPii: true,
  // In-app browsers (Instagram, Facebook, TikTok, etc.) inject their own
  // performance-logging scripts into our page. When the WebView is torn down
  // their native Java bridge object is GC'd while the injected JS still calls
  // postMessage, throwing "Java object is gone". These bubble to window.onerror
  // and get reported even though none of our code ran — drop them.
  ignoreErrors: [
    "Java object is gone",
    "Error invoking postMessage",
  ],
  denyUrls: [
    // Scripts injected by native in-app browser WebViews, not served by us.
    /navigation_performance_logger/i,
    /^app:\/\//i,
  ],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
