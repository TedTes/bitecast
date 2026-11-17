from __future__ import annotations

import json
from datetime import UTC, datetime

import numpy as np
import pandas as pd

from bitecast_ml.broad import enrich_broad_observations, forecast_time_blocks
from bitecast_ml.broad_ingestion import aggregate_hourly_logs_to_broad, longpoint_reports_to_broad
from bitecast_ml.broad_training import BroadTrainingConfig, train_broad_model
from bitecast_ml.model import ModelBundle
from bitecast_ml.registry import ModelRegistry
from bitecast_ml.synthetic import generate_synthetic_broad_training_data, generate_synthetic_training_data
from bitecast_ml.validation import validate_broad_training_frame
from bitecast_ml.worker import _prediction_plan


def test_broad_contract_accepts_trip_precision_and_unknown_effort() -> None:
    report = validate_broad_training_frame(generate_synthetic_broad_training_data(50))
    assert len(report.valid) == 50
    assert report.issues == []
    assert set(report.valid["label_granularity"]) == {"trip"}


def test_longpoint_conversion_requires_explicit_source_authorization() -> None:
    reports = pd.DataFrame(
        [
            {
                "record_id": "report-1",
                "source_url": "https://example.test/report-1",
                "contributor_hash": "angler-1",
                "report_date": "2026-10-22",
                "lake_id": "lake-erie",
                "species": "walleye",
                "caught": True,
                "catch_count": 4,
                "effort_minutes": np.nan,
                "method": "troll",
                "fishing_depth_m": 7.5,
                "water_depth_m": 12.0,
            }
        ]
    )
    blocked, rejected = longpoint_reports_to_broad(reports)
    accepted, _ = longpoint_reports_to_broad(reports, authorize_source=True)
    assert blocked.empty
    assert "source_not_authorized_for_training" in rejected.iloc[0]["reasons"]
    assert len(accepted) == 1
    assert accepted.iloc[0]["time_precision"] == "day"
    assert not bool(accepted.iloc[0]["effort_known"])


def test_broad_environment_aggregates_the_uncertainty_period() -> None:
    observations = generate_synthetic_broad_training_data(1)
    start = pd.Timestamp(observations.iloc[0]["period_start"])
    weather = pd.DataFrame(
        {
            "lake_id": [observations.iloc[0]["lake_id"]] * 3,
            "hour_start": [start, start + pd.Timedelta(hours=1), start + pd.Timedelta(hours=2)],
            "air_temp_c": [4.0, 8.0, 6.0],
            "wind_kmh": [10.0, 20.0, 15.0],
            "cloud_pct": [20.0, 40.0, 60.0],
            "precip_mm": [0.0, 1.0, 2.0],
            "pressure_hpa": [1010.0, 1014.0, 1012.0],
        }
    )
    enriched = enrich_broad_observations(observations, weather)
    assert enriched.iloc[0]["air_temp_c"] == 6.0
    assert enriched.iloc[0]["air_temp_range_c"] == 4.0
    assert enriched.iloc[0]["precip_mm"] == 3.0


def test_precise_user_logs_feed_both_model_families_without_losing_granularity() -> None:
    hourly = generate_synthetic_training_data(12)
    broad = aggregate_hourly_logs_to_broad(hourly)
    report = validate_broad_training_frame(broad)
    assert len(report.valid) == 12
    assert set(report.valid["time_precision"]) == {"exact"}
    assert set(report.valid["label_granularity"]) == {"trip"}
    assert set(report.valid["source"]) == {"bitecast-user-trip-aggregate"}


def test_train_register_and_serve_broad_fallback(tmp_path) -> None:
    data = generate_synthetic_broad_training_data(1200)
    result = train_broad_model(
        data,
        tmp_path / "artifacts",
        BroadTrainingConfig(
            season_mode="open_water",
            iterations=25,
            depth=5,
            ensemble_size=2,
            minimum_rows=100,
            minimum_positive_rows=10,
        ),
    )
    bundle = ModelBundle(result.artifact_dir)
    assert bundle.model_family == "trip_broad"
    registry = ModelRegistry(tmp_path / "registry")
    registry.register(result.artifact_dir)
    registry.promote(result.version, require_improvement=False)
    path, family = registry.available_champion_path("open_water")
    assert path == result.artifact_dir
    assert family == "trip_broad"

    hourly_artifact = tmp_path / "hourly-artifact"
    hourly_artifact.mkdir()
    hourly_metadata = json.loads((result.artifact_dir / "metadata.json").read_text())
    hourly_metadata.update(
        {
            "version": "hourly-open-water-test",
            "model_family": "hourly",
            "prediction_granularity": "hour",
        }
    )
    (hourly_artifact / "metadata.json").write_text(json.dumps(hourly_metadata))
    (hourly_artifact / "metrics.json").write_text((result.artifact_dir / "metrics.json").read_text())
    registry.register(hourly_artifact)
    registry.promote("hourly-open-water-test", require_improvement=False)
    preferred_path, preferred_family = registry.available_champion_path("open_water")
    assert preferred_path == hourly_artifact
    assert preferred_family == "hourly"

    start = datetime(2026, 6, 1, tzinfo=UTC)
    weather = pd.DataFrame(
        {
            "hour_start": pd.date_range(start, periods=24, freq="h"),
            "air_temp_c": np.linspace(10, 20, 24),
            "wind_kmh": np.linspace(8, 22, 24),
            "gust_kmh": np.linspace(12, 28, 24),
            "wind_direction_deg": np.linspace(0, 345, 24),
            "cloud_pct": np.linspace(20, 80, 24),
            "precip_mm": np.zeros(24),
            "pressure_hpa": np.linspace(1008, 1015, 24),
            "pressure_change_3h_hpa": np.zeros(24),
        }
    )
    lake = {
        "id": "lake-uuid",
        "slug": "lake-erie",
        "region": "Great Lakes",
        "lat": 42.2,
        "lon": -81.2,
        "clarity_class": "stained",
        "area_km2": 25700,
        "max_depth_m": 64,
        "timezone": "America/Toronto",
    }
    blocks = forecast_time_blocks(lake, weather, "open_water")
    assert set(blocks["time_precision"]) == {"time_block"}
    inputs, predictions = _prediction_plan(lake, weather, "open_water", bundle)
    assert len(inputs) == len(predictions) == 24
    assert set(predictions["prediction_granularity"]) == {"time_block"}
    assert set(predictions["confidence"]) == {"Low"}
    assert predictions["bite_score"].between(0, 100).all()
