/**
 * Observability bootstrap — Sentry (crashes/perf) + PostHog (product analytics).
 *
 * Mirrors the web stack (same Sentry org `kitchyn-qv`, same PostHog project,
 * EU host). Everything here is GUARDED on env presence: with no DSN / API key
 * the app runs normally and these become no-ops, so a fresh clone boots without
 * any observability credentials. Real values arrive via EXPO_PUBLIC_* (see
 * .env.example) — never hardcoded.
 *
 * Phase 0 scope: initialize the SDKs and expose a typed capture helper. Wiring
 * richer events (login, order accepted, etc.) happens alongside those features
 * in Phase 1+.
 */
import * as Sentry from "@sentry/react-native";
import PostHog from "posthog-react-native";

import { env } from "./env";

let _posthog: PostHog | null = null;

/** Initialize Sentry + PostHog. Safe to call once, early, from the root layout. */
export function initObservability(): void {
  if (env.sentryDsn) {
    Sentry.init({
      dsn: env.sentryDsn,
      environment: env.appEnv,
      // Conservative defaults; tune sample rates once we have baseline volume.
      tracesSampleRate: env.appEnv === "production" ? 0.2 : 1.0,
      enabled: true,
    });
  }

  if (env.posthogApiKey) {
    _posthog = new PostHog(env.posthogApiKey, {
      host: env.posthogHost,
    });
  }
}

/** The PostHog client, or null when analytics is unconfigured. */
export function getPostHog(): PostHog | null {
  return _posthog;
}

/** Fire-and-forget product event. No-op when PostHog is unconfigured. */
export function capture(
  event: string,
  properties?: Record<string, string | number | boolean | null>
): void {
  _posthog?.capture(event, properties);
}

export { Sentry };
