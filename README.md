# BiteCast

Expo mobile app plus a pure TypeScript walleye forecast engine and Supabase schema scaffold.

## Run

```bash
npm install
npm run mobile
```

Then press `i`, `a`, or `w` in the Expo terminal. The current build uses local demo forecasts and persists catch logs to SQLite first. With the two public Supabase values configured, anonymous auth, catch sync, lake requests, identity linking, push-token registration and account recovery become active automatically.

## Verify

```bash
npm run typecheck
npm test
npm --prefix apps/mobile run lint
cd apps/mobile && npx expo-doctor
```

## What is live vs placeholder

Live locally: all routes, onboarding, paywall states, rules-based engine, explained forecasts, lake comparison/map fallback, offline-first catch-log storage, history, stats, settings, alerts UI, real connectivity/notification permission handling, Supabase auth/sync/request adapters, schema/RLS migrations, and Edge Functions for account deletion, RevenueCat entitlements, and alert delivery.

Adapters awaiting credentials/product decisions: licensed weather ingestion and persisted forecasts, RevenueCat store products, PostHog, Sentry, native production map tiles, verified launch regulations and the complete 30–50 lake catalog.
