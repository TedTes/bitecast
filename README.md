# BiteCast

Expo mobile app, a custom CatBoost walleye-model lifecycle, and a Supabase backend.

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

Live locally: all routes, onboarding, paywall states, explained demo forecasts, lake comparison/map fallback, offline-first catch-log storage, history, stats, settings, alerts UI, real connectivity/notification permission handling, Supabase auth/sync/request adapters, schema/RLS migrations, and Edge Functions for account deletion, RevenueCat entitlements, and alert delivery. The `ml/` workspace provides custom-model ingestion, validation, CatBoost ensemble training, calibration, lake/time holdouts, confidence, SHAP explanations, version registry, batch inference, audit snapshots, and scheduled retraining.

Production model blockers: legally usable historical outcome data with effort/no-catch labels, licensed historical and forecast weather, and a reviewed champion for each season mode. Other adapters awaiting credentials/product decisions: RevenueCat store products, PostHog, Sentry, native production map tiles, verified launch regulations and the complete 30–50 lake catalog.

## Custom model

```bash
cd ml
uv sync --extra dev
uv run pytest
```

See [`ml/README.md`](ml/README.md) for training, validation, promotion, inference, and worker commands. Synthetic fixtures test the software only and must never be used for production claims.
