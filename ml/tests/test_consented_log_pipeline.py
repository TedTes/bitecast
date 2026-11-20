from __future__ import annotations

import json

import pandas as pd

from bitecast_ml.dataset import enrich_from_normalized_environment
from bitecast_ml.export import export_consented_logs
from bitecast_ml.snapshot import create_training_snapshot
from bitecast_ml.synthetic import generate_synthetic_training_data
from bitecast_ml.validation import validate_training_frame


class FakeDatabase:
    def select(self, table: str, filters: dict) -> list[dict]:
        if table == "lakes":
            return [
                {
                    "id": "remote-lake-1",
                    "slug": "lake-erie",
                    "region": "Great Lakes",
                    "lat": 42.2,
                    "lon": -81.2,
                    "clarity_class": "stained",
                    "area_km2": 25700,
                    "max_depth_m": 64,
                }
            ]
        assert table == "training_eligible_catch_logs"
        assert filters["trip_started_at"] == "not.is.null"
        return [
            {
                "id": "ca7c08ba-e468-4e26-98f1-9bc5887c7cc6",
                "user_id": "user-1",
                "lake_id": "remote-lake-1",
                "trip_started_at": "2026-06-01T08:30:00-04:00",
                "trip_ended_at": "2026-06-01T10:00:00-04:00",
                "caught_at": "2026-06-01T09:15:00-04:00",
                "caught": True,
                "count": 1,
                "species": "walleye",
                "season_mode": "open_water",
                "method": "jig",
                "bait_category": "minnow",
                "depth_m": 7,
                "water_depth_m": 10,
                "clarity": "stained",
                "conditions": {},
                "training_consent_version": "policy-v1",
                "training_consent_updated_at": "2026-06-01T10:01:00Z",
                "client_updated_at": "2026-06-01T10:01:00Z",
            }
        ]


def test_export_preserves_versioned_consent_and_pseudonymizes_user() -> None:
    frame = export_consented_logs(FakeDatabase(), "test-secret")
    assert len(frame) == 2
    assert frame["anonymous_angler_id"].nunique() == 1
    assert frame["anonymous_angler_id"].iloc[0] != "user-1"
    assert set(frame["consent_policy_version"]) == {"policy-v1"}
    assert frame["caught"].tolist() == [False, True]
    assert len(validate_training_frame(frame).rejected) == 2


def test_normalized_environment_join_uses_exact_weather_and_prior_clarity() -> None:
    observations = pd.DataFrame(
        [
            {
                "lake_id": "lake-erie",
                "hour_start": "2025-06-01T10:00:00Z",
                "latitude": 42.2,
                "longitude": -81.2,
            }
        ]
    )
    weather = pd.DataFrame(
        [
            {
                "lake_id": "lake-erie",
                "hour_start_utc": "2025-06-01T10:00:00Z",
                "air_temp_c": 18.0,
                "wind_kmh": 12.0,
                "wind_gust_kmh": 19.0,
                "pressure_hpa": 1012.0,
            }
        ]
    )
    water = pd.DataFrame(
        [{"lake_id": "lake-erie", "observed_on": "2025-06-01", "surface_water_temp_c": 16.5}]
    )
    clarity = pd.DataFrame(
        [
            {"lake_id": "lake-erie", "observed_on": "2025-05-20", "secchi_depth_m": 3.1},
            {"lake_id": "lake-erie", "observed_on": "2025-06-05", "secchi_depth_m": 8.8},
        ]
    )
    enriched = enrich_from_normalized_environment(observations, weather, water, clarity)
    row = enriched.iloc[0]
    assert row["air_temp_c"] == 18.0
    assert row["gust_kmh"] == 19.0
    assert row["water_temp_c"] == 16.5
    assert row["secchi_depth_m"] == 3.1


def test_enriched_user_log_passes_training_contract() -> None:
    raw = export_consented_logs(FakeDatabase(), "test-secret")
    weather = pd.DataFrame(
        [
            {
                "lake_id": "lake-erie",
                "hour_start_utc": hour,
                "air_temp_c": 18.0,
                "wind_kmh": 12.0,
                "wind_gust_kmh": 19.0,
                "wind_direction_deg": 220.0,
                "cloud_pct": 70.0,
                "precip_mm": 0.0,
                "pressure_hpa": 1012.0,
                "pressure_change_3h_hpa": -1.2,
            }
            for hour in ("2026-06-01T12:00:00Z", "2026-06-01T13:00:00Z")
        ]
    )
    enriched = enrich_from_normalized_environment(raw, weather)
    report = validate_training_frame(enriched)
    assert len(report.valid) == 2
    assert report.issues == []


def test_training_snapshot_is_content_addressed_and_repeatable(tmp_path) -> None:
    valid = validate_training_frame(generate_synthetic_training_data(12)).valid
    first = create_training_snapshot(valid, tmp_path)
    second = create_training_snapshot(valid.sample(frac=1, random_state=42), tmp_path)
    assert first.dataset_hash == second.dataset_hash
    assert first.directory == second.directory
    manifest = json.loads(first.manifest_path.read_text())
    assert manifest["row_count"] == 12
    assert manifest["dataset_hash"] == first.dataset_hash
