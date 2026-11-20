# BiteCast

Expo mobile app, a custom CatBoost walleye-model lifecycle, and a Supabase backend.

## Run

```bash
npm install
npm run mobile
```

Then press `i`, `a`, or `w` in the Expo terminal. An unconfigured build uses local demo forecasts. With the two public Supabase values configured, the app refreshes from published BiteCast forecasts, persists them for offline use, and activates anonymous auth, catch sync, lake requests, identity linking, push-token registration, and account recovery. Catch logs are always written to SQLite before sync.

## Verify

```bash
npm run typecheck
npm test
npm --prefix apps/mobile run lint
cd apps/mobile && npx expo-doctor
```

## What is live vs placeholder

Live: all routes, onboarding, paywall states, explained forecasts, lake comparison/map fallback, offline forecast and catch-log storage, history, stats, settings, alerts UI, real connectivity/notification permission handling, Supabase auth/sync/request adapters, schema/RLS migrations, and Edge Functions for account deletion, RevenueCat entitlements, and alert delivery. The `ml/` workspace provides custom-model ingestion, validation, CatBoost ensemble training, calibration, lake/time holdouts, confidence, SHAP explanations, version registry, batch inference, audit snapshots, and retraining software. A manually triggered Cloud Run forecast worker uses ECCC RDPS weather and has published a verified three-day early-access canary for eight lakes.

Production-quality model claims remain blocked by insufficient outcome evidence, source and lake concentration, and the absence of reviewed champion artifacts. The current broad models are protected early-access challengers: scores are capped at 69, confidence is always Low, and copy states that they are relative outlooks rather than validated catch probabilities. No forecast or training schedule is active. Other adapters awaiting credentials/product decisions include RevenueCat store products, PostHog, Sentry, native production map tiles, verified launch regulations, privacy/terms URLs, and the complete 30–50 lake catalog.

## Custom model

```bash
cd ml
uv sync --extra dev
uv run pytest
```

See [`ml/README.md`](ml/README.md) for training, validation, promotion, inference, and worker commands. Synthetic fixtures test the software only and must never be used for production claims.
