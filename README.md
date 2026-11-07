# BiteCast

Expo mobile app plus a pure TypeScript walleye forecast engine and Supabase schema scaffold.

## Run

```bash
npm install
npm run mobile
```

Then press `i`, `a`, or `w` in the Expo terminal. The current build uses local demo forecasts and persists catch logs to SQLite. Copy `.env.example` values into EAS environment variables when the external services are ready.

## Verify

```bash
npm run typecheck
npm test
npm --prefix apps/mobile run lint
cd apps/mobile && npx expo-doctor
```

## What is live vs placeholder

Live locally: all routes, onboarding, paywall states, rules-based engine, explained forecasts, lake comparison/map fallback, offline-first catch-log storage, history, stats, settings, alerts UI, auth/request flows and schema/RLS migrations.

Adapters awaiting credentials/product decisions: licensed weather ingestion, Supabase auth/sync/functions, RevenueCat products, Expo push delivery, PostHog, Sentry, native production map tiles, verified launch regulations and the complete 30–50 lake catalog.
