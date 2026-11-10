# BiteCast custom model

This package is the complete data-driven forecast lifecycle. It does not blend with or fall back to the deterministic engine. When model evidence is insufficient it returns low confidence or `forecast_available=false`.

The v1 target is the probability of at least one walleye catch during a consented angler-hour. The displayed 0–100 bite score is the percentile of that prediction against comparable historical model outputs; it is not a catch probability and never assesses ice safety.

## Local development

```bash
cd ml
uv sync --extra dev
uv run bitecast-ml generate-fixture data/development.parquet --rows 3000
uv run bitecast-ml validate data/development.parquet data/validated
uv run bitecast-ml train data/validated/valid.parquet artifacts --season open_water --iterations 100
uv run bitecast-ml train data/validated/valid.parquet artifacts --season ice --iterations 100
uv run pytest
uv run ruff check .
```

Synthetic data proves the pipeline only. It must never support product claims or production forecasts.

## Real-data admission

1. Add the source and its verified licence to `config/data_sources.json` using the example structure.
2. Require commercial-use permission and measured fishing effort.
3. Preserve the raw input and immutable SHA-256 manifest with `ingest`.
4. Join licensed historical weather and astronomy to the actual observation hour.
5. Run `validate`; rejected rows are quarantined and never enter training.
6. Train with time-separated trips and whole lakes held out.

Catch-only social posts and tournament results may be auxiliary evidence but are not valid primary labels because they omit failures and representative effort.

## Promotion and inference

```bash
uv run bitecast-ml register artifacts/<version> registry
uv run bitecast-ml promote <version> registry
uv run bitecast-ml infer forecast-input.parquet registry/models/<version> predictions.parquet
```

Promotion compares Brier score and top-window lift with the existing champion. Automatic promotion is disabled by default. The production worker requires champion artifacts for both `open_water` and `ice`.

## Production secrets

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TRAINING_PSEUDONYM_KEY`
- `BASE_TRAINING_DATA_URL`
- `BASE_TRAINING_DATA_TOKEN` (optional for a signed public URL)
- `WEATHER_API_BASE_URL`
- `WEATHER_API_KEY`
- `MODEL_REGISTRY_PATH`

The service-role and weather keys belong in the worker environment, never in the mobile app. The weather endpoint is intentionally provider-neutral until a commercially licensed provider is selected.

## Retraining

The monthly workflow downloads the immutable curated base dataset, exports cumulative consented logs, combines and validates both sources, and invokes scheduled retraining only after the configured new-row threshold. New versions remain challengers and are uploaded for review. A human promotes the first production generations.
