# Kitchyn Merchant — Mobile App (`@foodo/mobile`)

Native Android (iOS fast-follow) app for the Kitchyn **merchant platform** —
serves both `merchant_owner` and `merchant_staff` (frontline) roles. Built with
Expo + React Native + Expo Router, living inside this monorepo so it shares the
schema types (`@foodo/database`), money/format logic (`@foodo/utils`), and brand
tokens (`@foodo/tokens`) with the web app.

See the product docs:
- [../../docs/mobile-app-prd.md](../../docs/mobile-app-prd.md)
- [../../docs/mobile-app-implementation-plan.md](../../docs/mobile-app-implementation-plan.md)

---

## Status: Phase 0 — Foundation ✅

What's in place:
- Expo (SDK 54) + Expo Router + TypeScript + NativeWind scaffold.
- **Monorepo wiring** (`metro.config.js`): Metro watches the repo root and
  transpiles the workspace `@foodo/*` packages from their raw `./src` TS source.
- **Shared-import smoke test** ([app/index.tsx](app/index.tsx)): imports
  `formatKobo` from `@foodo/utils` and the `orders` Row type from
  `@foodo/database`, and runs a live Supabase `getSession()` connectivity check.
- **Supabase client** ([src/lib/supabase.ts](src/lib/supabase.ts)) via the shared
  `createMobileClient`, with a chunked **expo-secure-store** session adapter.
- **Brand theme** from `@foodo/tokens` (NativeWind + JS `theme`).
- **Observability** ([src/lib/observability.ts](src/lib/observability.ts)):
  Sentry + PostHog, env-guarded (no-op without credentials).
- App identity, Android package id `com.kitchyn.merchant`, placeholder brand
  icon/splash, and `eas.json` build profiles.

Deferred to **Phase 1** (the order loop): login + role routing, orders queue,
realtime, FCM push, status actions, menu availability.

---

## Prerequisites

- **Node 20 or 22 LTS.** Expo tooling officially supports Node ≤ 22; this package
  pins `engines: node >=20 <23`. The repo machine may have a newer Node — use
  `nvm use 22` (an `.nvmrc` is provided) before running Expo commands.
- A Supabase project (same one the web app uses).

## Setup

```bash
# from the repo root
npm install

# configure env
cd apps/mobile
cp .env.example .env
# fill EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY (same project as web)
# optionally EXPO_PUBLIC_SENTRY_DSN / EXPO_PUBLIC_POSTHOG_KEY
```

## Run

```bash
# from apps/mobile
npm run start        # Expo dev server (scan QR with Expo Go / dev client)
npm run android      # build & open on Android
npm run type-check   # tsc --noEmit
npm run bundle:android   # produce a production JS bundle (Metro export) — CI/verify
```

## Build & release (EAS)

Builds run in the cloud via EAS (not local `turbo build` — the root `build`
script is a no-op for this app on purpose, so `apps/web` deploys are untouched).

```bash
eas login
eas init                 # sets extra.eas.projectId
eas build -p android --profile preview      # internal AAB
eas submit -p android --profile production   # upload to Play Console
```

Profiles are in [eas.json](eas.json): `development` (dev client), `preview`
(internal AAB), `production` (store AAB).

---

## Monorepo notes (important)

- **Do NOT import `@foodo/ui`** — it's web-only (React-DOM + Tailwind). Mobile has
  its own component layer; only brand *tokens* are shared via `@foodo/tokens`.
- Metro resolves workspace packages via `watchFolders`/`nodeModulesPaths` in
  [metro.config.js](metro.config.js). If a shared package fails to resolve,
  that's the file to check.
- This app is excluded from the web build/deploy: its `build` script is a no-op
  and Vercel's root stays `apps/web`. Don't add it to the Turbo `build` graph.

## Architecture

```
app/                 Expo Router routes (index = Phase 0 smoke screen)
  _layout.tsx        root layout: url-polyfill, observability init, safe-area
  index.tsx          foundation smoke-test screen
src/
  lib/
    env.ts                 typed EXPO_PUBLIC_* access + config guards
    supabase.ts            singleton client (shared createMobileClient)
    secure-store-adapter.ts  chunked expo-secure-store session storage
    observability.ts       Sentry + PostHog (env-guarded)
  theme/             JS theme mirror of @foodo/tokens
assets/              placeholder brand icon / splash (replace before launch)
```
