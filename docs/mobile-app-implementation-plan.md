# Kitchyn Merchant Mobile App — Implementation Plan

**Companion to:** [mobile-app-prd.md](mobile-app-prd.md)
**Date:** 2026-06-08
**Status:** Proposed

---

## 0. Repository Decision (recommendation)

> **Recommendation: build inside *this* monorepo as a new `apps/mobile` workspace
> (Expo + React Native), NOT a separate repo.**

### Why same monorepo

| Factor | Same monorepo (`apps/mobile`) | Separate repo |
|---|---|---|
| **Shared types** (`@foodo/database`) | ✅ Direct import, always in sync with schema | ❌ Copy/publish, drifts |
| **Shared money logic** (`@foodo/utils` — `formatKobo`, settlement net) | ✅ One source of truth; mobile money == web money | ❌ Re-implement → drift risk (this is financial code) |
| **API contracts** (`/api/dashboard/*`) | ✅ Defined right next to the consumer | ❌ Out-of-band coordination |
| **Tooling** | ✅ Turborepo already configured for multi-app | ❌ New CI/CD from scratch |
| **Atomic changes** (schema + web + mobile in one PR) | ✅ | ❌ Multi-repo dance |
| **Release cadence independence** | ⚠️ Slightly coupled (mitigated by per-app CI filters) | ✅ Fully independent |
| **Metro/Next bundler friction** | ⚠️ Needs Metro config for workspace symlinks | ✅ None |

The decisive factors are **shared financial/utility logic** and **shared schema
types**. Kitchyn's money math (kobo, settlement net formulas in `@foodo/utils` +
`foodo_order_net_kobo()`) must be byte-identical across web and mobile — keeping
them in one repo makes drift structurally impossible. The two downsides (Metro
config, coupled CI) are well-understood and cheap to mitigate.

### Important caveat: do NOT share `@foodo/ui`
`@foodo/ui` is React-DOM + Tailwind (web-only). React Native cannot consume it.
The mobile app gets its **own component library** (`apps/mobile`-local, built on
RN primitives + a styling system), sharing only **brand tokens** (colors,
spacing, type scale) extracted from `tailwind.config.ts` into a
platform-agnostic tokens module (candidate: a small `packages/tokens`).

### When a separate repo would win
Only if (a) a different team with a fully independent release pipeline owns
mobile, or (b) we hit unacceptable Metro/monorepo friction. Neither applies
today. **Proceed in-repo.**

---

## 1. Technology Choice

| Concern | Choice | Rationale |
|---|---|---|
| Framework | **React Native via Expo (managed, with config plugins / EAS)** | Cross-platform (Android now, iOS fast-follow), mature push/biometric/secure-storage modules, OTA updates, EAS Build/Submit for Play. Native UI → satisfies Play "not a webview" requirement. |
| Language | **TypeScript** | Matches the whole repo; lets us import `@foodo/database` types. |
| Navigation | **Expo Router** (file-based) | Mirrors Next.js App Router mental model the team already uses. |
| Data/Auth | **`@supabase/supabase-js`** with React Native AsyncStorage/SecureStore adapter | Same client and RLS model as web; reuse auth + realtime + queries. |
| Realtime | Supabase Realtime channels | Identical pattern to web `frontline-orders-client`. |
| Push | **Firebase Cloud Messaging (FCM)** via `expo-notifications` | Android-native, high-priority data messages for order alerts. |
| Styling | **NativeWind** (Tailwind-for-RN) or restyle | Lets us reuse the Tailwind token vocabulary from web; fastest path to brand parity. |
| State/data fetching | **TanStack Query** | Caching, background refetch, retry, and catch-up-on-reconnect semantics out of the box. |
| Local storage / offline queue | **MMKV** (fast) or SQLite | For session, settings, and the P2 offline action queue. |
| Observability | **`@sentry/react-native`** + **PostHog RN SDK** | Same org/projects as web (`kitchyn-qv`, PostHog proj 191720). |
| Build/Release | **EAS Build + EAS Submit** | Signed AAB, Play App Signing, internal/closed/prod tracks. |

> Alternative considered and rejected for phase 1: **TWA/Bubblewrap or Capacitor
> wrapper** of the existing responsive dashboard. Faster to stand up, but (1)
> elevated Play-rejection risk for thin wrappers, (2) weak/unreliable background
> push, (3) non-native feel for the frontline operator. The order-alert
> reliability requirement alone justifies going native.

---

## 2. Target Architecture

```
foodov1.1/ (existing monorepo)
├─ apps/
│  ├─ web/                 # existing Next.js merchant/admin/storefront
│  ├─ rider/               # inactive — ignore
│  └─ mobile/              # NEW — Expo React Native merchant app
│     ├─ app/              # Expo Router routes
│     │  ├─ (auth)/login
│     │  ├─ (frontline)/orders, menu        # staff + owner kitchen mode
│     │  └─ (owner)/index, orders, menu,
│     │           customers, marketing,
│     │           analytics, wallet, settings
│     ├─ src/
│     │  ├─ components/    # mobile-native component library
│     │  ├─ features/      # orders, menu, wallet, ... (mirror web clients)
│     │  ├─ lib/           # supabase client, realtime, push, connection ctx
│     │  └─ theme/         # NativeWind config from shared tokens
│     ├─ app.config.ts     # Expo config (FCM, permissions, icons)
│     └─ eas.json
├─ packages/
│  ├─ database/            # SHARED types (consumed by mobile)
│  ├─ utils/               # SHARED money/format logic (consumed by mobile)
│  ├─ ui/                  # web-only — NOT shared with mobile
│  ├─ email-templates/     # unrelated
│  └─ tokens/              # NEW (optional) — brand tokens shared web+mobile
└─ turbo.json             # add mobile pipeline tasks
```

### Backend additions (additive, in `apps/web` API + Supabase)
- `device_tokens` table + RLS.
- `POST /api/merchant/notifications/register` & `/unregister` (or Supabase RPC).
- New-order push trigger: Supabase DB webhook / Edge Function on `orders` insert
  → fan out FCM to that restaurant's tokens. (Keep it server-side; do not embed
  FCM server key in the app.)
- (P2) `update-status` idempotency + `expectedFromStatus` validation per
  [frontline-reliability.md](frontline-reliability.md).

---

## 3. Monorepo Integration Notes (the known friction)

1. **Metro config:** enable workspace resolution so Metro follows symlinks to
   `packages/*`. Use Expo's monorepo guide (`metro.config.js` with
   `watchFolders` = repo root, `nodeModulesPaths`). Verified pattern; ~half a day.
2. **Transpile shared packages:** ensure `@foodo/utils` / `@foodo/database` ship
   types + ESM that RN/Metro can consume (they're currently consumed by Next).
   Add them to `transpilePackages`-equivalent (Metro `resolver`/babel) if needed.
3. **Keep mobile out of Next/Turbo web tasks:** add discrete `turbo` pipeline
   entries (`mobile#build`, `mobile#lint`) so `turbo run build` doesn't try to
   web-build the RN app, and Vercel keeps deploying only `apps/web`
   (`foodo-v1-1-web`, root `apps/web`).
4. **Vercel isolation:** confirm Vercel project ignores `apps/mobile` (root dir is
   already `apps/web`; add an ignore step if needed so mobile commits don't
   trigger web deploys unnecessarily).
5. **No DOM packages:** never import `@foodo/ui` or anything pulling `react-dom`
   into mobile; lint rule/boundary to enforce.

---

## 4. Phased Build Plan

Each phase ends in something shippable to an internal testing track.

### Phase 0 — Foundation (≈ 1 week)
- [ ] Scaffold `apps/mobile` (Expo, TS, Expo Router, NativeWind).
- [ ] Metro + Turbo monorepo wiring; import a `formatKobo` from `@foodo/utils`
      and a type from `@foodo/database` as a smoke test.
- [ ] Extract brand tokens (colors/spacing/type) → `packages/tokens` (or local).
- [ ] Supabase client with SecureStore session adapter; realtime configured.
- [ ] Sentry RN + PostHog RN initialized (same projects as web).
- [ ] App icon, splash, name; EAS project + internal track set up.
- **Exit:** app builds, installs via internal track, connects to Supabase.

### Phase 1 — The Order Loop (MVP, launch-blocking) (≈ 2–3 weeks)
- [ ] **Auth:** login screen, Supabase email/password, secure session, role
      routing (owner vs staff), sign out, biometric unlock.
- [ ] **Navigation shell:** bottom tabs per role (frontline = Orders, Menu).
- [ ] **Orders queue:** kanban columns, order cards, detail sheet (items,
      options, instructions, customer, price breakdown via `formatKobo`).
- [ ] **Realtime:** Supabase `postgres_changes` subscription; connection context
      + banner (offline/reconnecting/online); catch-up refetch on reconnect
      (port `frontline-reliability.md` Layers 1–2).
- [ ] **Status actions:** Accept/Preparing/Ready against
      `/api/dashboard/orders/update-status` (optimistic + revert on failure).
- [ ] **Dispatch:** platform vs own rider via `/api/dashboard/orders/dispatch`.
- [ ] **Menu availability toggle** (frontline menu).
- [ ] **Native alerts:** foreground repeating sound + mute; **FCM push** for new
      orders incl. backend `device_tokens` + insert trigger; permission
      pre-prompt; tap-through deep link to the order.
- [ ] Call-customer (dialer intent), open-in-maps intent.
- **Exit:** a frontline operator can run a full service from the phone, alerted
  to every order. **This is independently launchable** as v1.0 (frontline app).

### Phase 2 — Owner Parity (≈ 3–4 weeks)
- [ ] **Owner home/overview** (port `dashboard-home-client`): today's KPIs.
- [ ] **Full menu manager** (port `menu-manager-client`): category/item/option
      CRUD, images (native image picker → upload).
- [ ] **Customers**: list, search, history, CSV export via native share sheet.
- [ ] **Marketing**: promo codes + SMS campaign (`/marketing/sms-campaign`).
- [ ] **Analytics**: revenue trend, orders by day/hour, KPIs (native charts).
- [ ] **Wallet** (read-only): balances, expected payout, payout history.
- [ ] **Settings**: profile, bank account, delivery pricing/location,
      notification email, password change, **staff management** (`/staff/*`).
- **Exit:** full functional parity with the web merchant dashboard.

### Phase 3 — Mobile Excellence & iOS (≈ 2–3 weeks)
- [ ] **Offline action queue** (P2): MMKV/SQLite queue + idempotent
      `update-status` (`expectedFromStatus`, `Idempotency-Key`), conflict toasts,
      syncing banner state — per `frontline-reliability.md` Layer 3.
- [ ] Deep links / Android app links.
- [ ] Polish: haptics, dark mode, large-screen/tablet, accessibility pass.
- [ ] **iOS:** APNs setup, App Store assets, TestFlight, submission.
- **Exit:** resilient on poor networks; iOS in review.

---

## 5. Google Play Submission Checklist (Phase 1 gate)

- [ ] Native UI throughout (no webview-wrapper risk).
- [ ] Signed **AAB** via EAS; **Play App Signing** enrolled.
- [ ] Target API level meets current Play requirement; min SDK 26.
- [ ] **Privacy policy** URL published (covers FCM token, PostHog, Sentry,
      account data, deletion).
- [ ] **Data Safety** form completed accurately.
- [ ] **Account deletion** path (in-app + web URL).
- [ ] `POST_NOTIFICATIONS` permission justified; pre-prompt implemented.
- [ ] Content rating questionnaire; category Food & Drink / Business.
- [ ] Pre-launch report clean; internal → closed → production rollout.
- [ ] Store listing: screenshots, feature graphic, description, support contact.

---

## 6. Risks & Mitigations (engineering)

| Risk | Mitigation |
|---|---|
| Metro + workspace symlinks | Follow Expo monorepo guide; smoke-test shared import in Phase 0 (de-risk early). |
| Shared package is ESM/CJS-incompatible with Metro | Validate `@foodo/utils`/`@foodo/database` build output; adjust exports if needed. |
| Android background push killed by OEMs/Doze | High-priority FCM + realtime + catch-up redundancy; consider open-hours foreground service in Phase 3. |
| Auth round-trip latency (existing ~600ms `getUser`) | Rely on locally cached session; don't gate UI on network auth; tracked in `performance-audit-2026-06.md`. |
| Money display drift | Import `@foodo/utils`; never re-implement kobo/settlement math. |
| `@foodo/ui` accidentally imported | Lint boundary / dependency rule blocking `react-dom` in mobile. |
| Realtime fan-out cost at scale | Reuse per-restaurant channel scoping already used on web. |

---

## 7. Estimated Timeline

| Phase | Scope | Est. |
|---|---|---|
| 0 | Foundation | ~1 wk |
| 1 | Order loop MVP (launchable) | ~2–3 wk |
| 2 | Owner parity | ~3–4 wk |
| 3 | Offline queue + iOS | ~2–3 wk |
| | **Android launch (end of Phase 1)** | **~3–4 wk in** |
| | **Full parity (end of Phase 2)** | **~7–8 wk in** |

Single full-time mobile engineer assumed; parallelizable.

---

## 8. Immediate Next Steps

1. **Confirm repo decision** (recommended: in-repo `apps/mobile`).
2. Confirm framework (recommended: Expo RN + Expo Router).
3. Stand up Phase 0 scaffold + Metro/Turbo wiring + shared-import smoke test.
4. Spin up the FCM/Firebase project and `device_tokens` backend design review.
5. Draft privacy policy + Play Console app shell (in parallel with Phase 0/1).
