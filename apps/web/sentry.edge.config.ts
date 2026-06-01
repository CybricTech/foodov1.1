import * as Sentry from "@sentry/nextjs";

const isProd = process.env.NEXT_PUBLIC_APP_ENV === "production";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_APP_ENV ?? "development",
  tracesSampleRate: isProd ? 0.2 : 1.0,
  enableLogs: true,
  sendDefaultPii: true,
});
