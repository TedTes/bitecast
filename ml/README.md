# BiteCast custom model

This package is the complete data-driven forecast lifecycle. It does not blend with or fall back to the deterministic engine. It supports two isolated custom-model families: precise `hourly` champions and `trip_broad` champions trained from honest trip/time-block labels. The worker prefers hourly and falls back to broad only when no hourly champion exists for that season.

The v1 target is the probability of at least one walleye catch during a consented angler-hour. The displayed 0–100 bite score is the percentile of that prediction against comparable historical model outputs; it is not a catch probability and never assesses ice safety.

The broad bootstrap target is whether a report/trip caught walleye during its recorded uncertainty period. It never converts a trip result into synthetic hourly labels. Its output is a Low-confidence time-block outlook, not an exact peak-hour claim.

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

Broad bootstrap commands:

```bash
uv run bitecast-ml prepare-longpoint-broad ../data/extracted/longpoint-forum-reports.csv \
  data/broad/longpoint-observations.parquet data/broad/longpoint-rejected.csv --authorize-source
uv run bitecast-ml enrich-broad data/broad/longpoint-observations.parquet \
  ../data/normalized/historical-weather.parquet data/broad/longpoint-enriched.parquet
uv run bitecast-ml validate-broad data/broad/longpoint-enriched.parquet data/broad/validated
uv run bitecast-ml train-broad data/broad/validated/valid.parquet artifacts --season open_water
```

`--authorize-source` is an explicit project decision, not an inferred property of scraped data. Technical
admission still requires walleye, date, supported lake, and catch/no-catch fields. Missing effort is retained
as missing and downweighted rather than fabricated.

Synthetic data proves the pipeline only. It must never support product claims or production forecasts.

## Real-data admission

1. Add the source and its verified licence to `config/data_sources.json` using the example structure.
2. Require commercial-use permission and measured fishing effort.
3. Preserve the raw input and immutable SHA-256 manifest with `ingest`.
4. Join licensed historical weather and astronomy to the actual observation hour.
5. Run `validate`; rejected rows are quarantined and never enter training.
6. Create an immutable, content-addressed dataset with `snapshot-training-data`.
7. Train with time-separated trips and whole lakes held out.

For the repository-normalized research snapshot:

```bash
uv run bitecast-ml enrich-normalized outcomes.parquet ../data/normalized/historical-weather.parquet enriched.parquet \
  --water-conditions ../data/normalized/water-conditions.parquet \
  --lake-clarity ../data/normalized/lake-clarity.parquet
uv run bitecast-ml validate enriched.parquet data/validated
uv run bitecast-ml snapshot-training-data data/validated/valid.parquet data/snapshots
```

Production consented logs use `enrich-provider`, backed by a commercially approved historical-weather
provider. The repository Open-Meteo snapshot remains evaluation-only.

Trip reports are admitted only to the separate broad family with preserved time precision and lower quality
weights. They do not satisfy the hourly contract and cannot directly become hourly labels.

## Promotion and inference

```bash
uv run bitecast-ml register artifacts/<version> registry
uv run bitecast-ml promote <version> registry
uv run bitecast-ml infer forecast-input.parquet registry/models/<version> predictions.parquet
```

Promotion compares Brier score and top-window lift only within the same model family and season. Automatic promotion is disabled by default. The production worker requires either an hourly or broad champion for both `open_water` and `ice`; hourly always wins when both exist.

## Production secrets

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TRAINING_PSEUDONYM_KEY`
- `BASE_TRAINING_DATA_URL`
- `BASE_TRAINING_DATA_TOKEN` (optional for a signed public URL)
- `HISTORICAL_WEATHER_URL`
- `HISTORICAL_WEATHER_API_KEY`
- `WEATHER_PROVIDER=open_meteo`
- `OPEN_METEO_BASE_URL=https://customer-api.open-meteo.com`
- `OPEN_METEO_API_KEY` (paid commercial customer key)
- `WEATHER_API_BASE_URL`, `WEATHER_API_KEY` (only when using the legacy provider-neutral contract)
- `MODEL_REGISTRY_PATH`

The service-role and weather keys belong in the worker environment, never in the mobile app. Production
uses Open-Meteo's paid customer endpoint; the free endpoint is not an automatic fallback. BiteCast requests
UTC hourly temperature, precipitation, sea-level pressure, cloud cover, wind speed/direction and gusts,
then computes the three-hour pressure change locally. Open-Meteo attribution must be included in the app's
legal/data-source presentation.

## Retraining

The monthly workflow downloads the immutable curated base dataset, exports cumulative currently consented
logs, joins approved historical weather, validates both sources, writes a content-addressed snapshot, and
invokes scheduled retraining only after the configured new-row threshold. New versions remain challengers
and are uploaded for review. A human promotes the first production generations.
