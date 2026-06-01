import * as Sentry from "@sentry/nextjs";

const isProd = process.env.NEXT_PUBLIC_APP_ENV === "production";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_APP_ENV ?? "development",

  // 100% in dev/staging so nothing is missed; 20% in production to stay
  // within quota while still catching the important tail.
  tracesSampleRate: isProd ? 0.2 : 1.0,

  enableLogs: true,

  // Sends request URLs and user IP — useful for tracing failed checkouts.
  sendDefaultPii: true,
});
