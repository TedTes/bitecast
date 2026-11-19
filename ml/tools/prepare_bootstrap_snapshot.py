"""Build the immutable, environment-enriched bootstrap snapshot and readiness report."""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from bitecast_ml.broad import enrich_broad_observations
from bitecast_ml.broad_ingestion import broad_dataset_hash
from bitecast_ml.validation import validate_broad_training_frame

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_ROOT = REPO_ROOT / "data"
WEATHER_SOURCES = (
    (
        DATA_ROOT / "raw/historical-weather/lake-erie-open-meteo-2013-07-14-2013-07-15.json",
        "lake-erie",
    ),
    (
        DATA_ROOT / "raw/historical-weather/lake-erie-open-meteo-2026-10-22-2026-11-04.json",
        "lake-erie",
    ),
    (
        DATA_ROOT / "raw/historical-weather/lake-erie-open-meteo-2026-08-15-2026-10-01.json",
        "lake-erie",
    ),
    (
        DATA_ROOT / "raw/historical-weather/bay-of-quinte-open-meteo-2026-01-02-2026-03-03.json",
        "bay-of-quinte",
    ),
    (
        DATA_ROOT / "raw/historical-weather/bay-of-quinte-open-meteo-2026-07-31-2026-08-22.json",
        "bay-of-quinte",
    ),
)
WEATHER_FIELDS = {
    "temperature_2m": "air_temp_c",
    "precipitation": "precip_mm",
    "cloud_cover": "cloud_pct",
    "pressure_msl": "pressure_hpa",
    "wind_speed_10m": "wind_kmh",
    "wind_direction_10m": "wind_direction_deg",
    "wind_gusts_10m": "gust_kmh",
}
MINIMUM_ROWS = 100
MINIMUM_CLASS_ROWS = 20
MAXIMUM_SOURCE_FRACTION = 0.8
PRODUCTION_WEATHER_APPROVED = False


def normalize_weather() -> pd.DataFrame:
    frames: list[pd.DataFrame] = []
    for path, lake_id in WEATHER_SOURCES:
        payload = json.loads(path.read_text())
        if payload.get("error"):
            raise ValueError(f"Weather source failed: {path.name}: {payload.get('reason')}")
        hourly = payload["hourly"]
        frame = pd.DataFrame({"hour_start": pd.to_datetime(hourly["time"], utc=True)})
        for source, target in WEATHER_FIELDS.items():
            frame[target] = hourly[source]
        frame.insert(0, "lake_id", lake_id)
        frame["pressure_change_3h_hpa"] = pd.to_numeric(frame["pressure_hpa"]).diff(3)
        frame["source_id"] = f"open-meteo-evaluation-{path.stem}"
        frame["production_eligible"] = False
        frames.append(frame)
    weather = pd.concat(frames, ignore_index=True).drop_duplicates(["lake_id", "hour_start"])
    weather = weather.sort_values(["lake_id", "hour_start"]).reset_index(drop=True)
    weather.to_parquet(DATA_ROOT / "normalized/bootstrap-outcome-weather.parquet", index=False)
    return weather


def _join_whole_lake_temperature(frame: pd.DataFrame) -> pd.DataFrame:
    water = pd.read_parquet(DATA_ROOT / "normalized/water-conditions.parquet")
    water = water[water["lake_id"].eq("lake-erie")].copy()
    water["observed_on"] = pd.to_datetime(water["observed_on"]).dt.date
    result = frame.copy()
    result["_observed_on"] = pd.to_datetime(result["period_start"], utc=True).dt.date
    result = result.merge(
        water[["lake_id", "observed_on", "surface_water_temp_c"]],
        left_on=["lake_id", "_observed_on"],
        right_on=["lake_id", "observed_on"],
        how="left",
    )
    result["water_temp_c"] = result["surface_water_temp_c"].combine_first(result["water_temp_c"])
    return result.drop(columns=["_observed_on", "observed_on", "surface_water_temp_c"])


def build() -> dict:
    observations = pd.concat(
        [
            pd.read_parquet(DATA_ROOT / "extracted/longpoint-broad-observations.parquet"),
            pd.read_parquet(DATA_ROOT / "extracted/quintefishing-broad-observations.parquet"),
        ],
        ignore_index=True,
        sort=False,
    )
    weather = normalize_weather()
    enriched = _join_whole_lake_temperature(enrich_broad_observations(observations, weather))
    validation = validate_broad_training_frame(enriched)
    valid = validation.valid
    valid.to_parquet(DATA_ROOT / "validated/bootstrap-broad.parquet", index=False)
    validation.rejected.to_parquet(DATA_ROOT / "rejected/bootstrap-broad.parquet", index=False)

    positives = int(valid["caught"].astype(bool).sum()) if not valid.empty else 0
    negatives = len(valid) - positives
    environment = ["air_temp_c", "wind_kmh", "cloud_pct", "pressure_hpa"]
    environment_complete = int(valid[environment].notna().all(axis=1).sum()) if not valid.empty else 0
    starts = (
        pd.to_datetime(valid["period_start"], utc=True)
        if not valid.empty
        else pd.Series(dtype="datetime64[ns, UTC]")
    )
    source_share = (
        float(valid["source"].value_counts().iloc[0] / len(valid)) if not valid.empty else 0.0
    )
    ready = (
        len(valid) >= MINIMUM_ROWS
        and positives >= MINIMUM_CLASS_ROWS
        and negatives >= MINIMUM_CLASS_ROWS
        and environment_complete == len(valid)
        and valid["lake_id"].nunique() >= 2
        and source_share <= MAXIMUM_SOURCE_FRACTION
        and not valid["observation_id"].duplicated().any()
        and PRODUCTION_WEATHER_APPROVED
    )
    report = {
        "generated_at": "2026-11-18",
        "decision": "TRAIN_CHALLENGER" if ready else "NO_GO",
        "dataset_hash": broad_dataset_hash(valid) if not valid.empty else None,
        "valid_rows": len(valid),
        "catch_rows": positives,
        "no_catch_rows": negatives,
        "positive_rate": float(positives / len(valid)) if len(valid) else None,
        "environment_complete_rows": environment_complete,
        "duplicate_observation_ids": (
            int(valid["observation_id"].duplicated().sum()) if not valid.empty else 0
        ),
        "lakes": valid["lake_id"].value_counts().to_dict() if not valid.empty else {},
        "seasons": valid["season_mode"].value_counts().to_dict() if not valid.empty else {},
        "months": starts.dt.month.value_counts().sort_index().to_dict() if not valid.empty else {},
        "earliest_observation": starts.min().isoformat() if not valid.empty else None,
        "latest_observation": starts.max().isoformat() if not valid.empty else None,
        "largest_source_fraction": source_share,
        "validation": validation.summary,
        "gates": {
            "minimum_rows": MINIMUM_ROWS,
            "minimum_catch_rows": MINIMUM_CLASS_ROWS,
            "minimum_no_catch_rows": MINIMUM_CLASS_ROWS,
            "minimum_lakes": 2,
            "maximum_source_fraction": MAXIMUM_SOURCE_FRACTION,
            "environment_required_for_every_row": True,
            "production_weather_approved": PRODUCTION_WEATHER_APPROVED,
        },
        "blockers": [
            message
            for failed, message in (
                (len(valid) < MINIMUM_ROWS, f"Need {MINIMUM_ROWS} rows; have {len(valid)}"),
                (positives < MINIMUM_CLASS_ROWS, f"Need {MINIMUM_CLASS_ROWS} catch rows; have {positives}"),
                (
                    negatives < MINIMUM_CLASS_ROWS,
                    f"Need {MINIMUM_CLASS_ROWS} no-catch rows; have {negatives}",
                ),
                (environment_complete != len(valid), "Some rows lack required environmental features"),
                (valid["lake_id"].nunique() < 2 if not valid.empty else True, "Only one lake is represented"),
                (
                    source_share > MAXIMUM_SOURCE_FRACTION,
                    "More than 80% of evidence comes from one source",
                ),
                (
                    bool(valid["observation_id"].duplicated().any()) if not valid.empty else False,
                    "Duplicate observation IDs remain",
                ),
                (
                    not PRODUCTION_WEATHER_APPROVED,
                    "Evaluation weather is not licensed for production use",
                ),
            )
            if failed
        ],
        "model_trained": False,
        "model_promoted": False,
    }
    (DATA_ROOT / "bootstrap-readiness-report.json").write_text(json.dumps(report, indent=2) + "\n")
    return report


def main() -> None:
    print(json.dumps(build(), indent=2))


if __name__ == "__main__":
    main()
