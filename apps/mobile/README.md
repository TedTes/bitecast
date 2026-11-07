# BiteCast mobile

Expo (SDK 58) + Expo Router app for BiteCast walleye forecasts. Product rules live in
[`docs/product-spec.md`](../../docs/product-spec.md); coding rules in [`AGENTS.md`](../../AGENTS.md).

## Run

```bash
npm install                 # from the repo root (npm workspaces)
cd apps/mobile
npx expo run:ios            # build + install the dev client (needed after adding native modules)
npx expo start --dev-client # day-to-day JS development
```

Rebuild the dev client (`npx expo run:ios` / `run:android`) whenever a native dependency
changes — for example `react-native-maps`. Until then the app falls back safely (the Map tab
shows the offline chart).

## Configuration

All external services are optional in development; the app runs on local demo data.

| Variable | Used for |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Sync, accounts, lake requests |
| `EXPO_PUBLIC_REVENUECAT_IOS_KEY`, `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` | Purchases (prices are dev placeholders until set) |
| `EXPO_PUBLIC_POSTHOG_KEY`, `EXPO_PUBLIC_SENTRY_DSN` | Analytics, crash reporting |
| `EXPO_PUBLIC_MAP_PROVIDER` | `react-native-maps` (default) or `cached` (offline chart only) |
| `GOOGLE_MAPS_ANDROID_API_KEY` | Build-time Google Maps key for Android (see `app.config.js`); iOS uses Apple Maps, no key |
| `EXPO_PUBLIC_TERMS_URL`, `EXPO_PUBLIC_PRIVACY_URL` | Paywall legal links |

Never put service-role keys in the app.

## Check

```bash
npm run typecheck           # from the repo root
npm test                    # engine + app unit tests
npm --prefix apps/mobile run lint
cd apps/mobile && npx expo-doctor
```

## Where things live

- `src/app` — routes (onboarding, tabs, lake forecast, window detail, logs, profile)
- `src/components` — design system (`ui.tsx`, `forecast.tsx`), sky arc + lake school, map boundary (`map/`)
- `src/constants/theme.ts` — colour, type, spacing and score-band tokens
- `src/api` — the only place external services are called
- `src/db` — SQLite-first local storage (catch logs are written here before any sync)
