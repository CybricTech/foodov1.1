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
    // Safari extensions / in-app WebViews referencing globals we never ship.
    // None of these identifiers exist anywhere in our codebase.
    "Can't find variable: CONFIG",
    // Snapchat in-app browser bridge global.
    "Can't find variable: SCDynimacBridge",
    // We render no iframes — injected scripts poking a torn-down iframe.
    /contentWindow\.postMessage/,
    // Android POS / WebView vendor bridge callback (frontline devices).
    "onModuleDataArrival is not defined",
    // iOS WKWebView native bridge poked by scripts injected into in-app
    // browsers (Instagram/TikTok) on the storefront. Not our code.
    /window\.webkit\.messageHandlers/,
    // Next.js RSC stream interrupted mid-flight (tab closed, network drop).
    // Expected on admin pages that auto-refresh on reconnect/visibility.
    "Connection closed.",
    // A fetch() that was aborted or lost its connection — Mobile Safari says
    // "Load failed", Chrome/Firefox "Failed to fetch" / "NetworkError when
    // attempting to fetch resource". Caught and handled (the app shows an error
    // toast and keeps working); overwhelmingly fires when a phone backgrounds
    // the tab, locks, or drops off a flaky mobile network. Same benign network
    // class as "Connection closed." above. A genuinely broken endpoint would
    // surface as a server-side 5xx, not a trickle of client fetch aborts.
    "Load failed",
    "Failed to fetch",
    "NetworkError when attempting to fetch resource",
  ],
  denyUrls: [
    // Scripts injected by native in-app browser WebViews, not served by us.
    /navigation_performance_logger/i,
    /^app:\/\//i,
  ],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
