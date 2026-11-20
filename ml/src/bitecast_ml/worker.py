from __future__ import annotations

import hashlib
import json
import os
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pandas as pd

from .astronomy import astronomy_features
from .broad import expand_block_predictions, forecast_time_blocks
from .contracts import FEATURE_CONTRACT_VERSION
from .model import ModelBundle
from .registry import ModelRegistry
from .scoring import forecast_windows
from .supabase_rest import SupabaseRest
from .weather import forecast_weather_provider_from_env


def run_forecast_worker(horizon_days: int = 7) -> dict[str, int]:
    required = [
        "SUPABASE_URL",
        "SUPABASE_SERVICE_ROLE_KEY",
        "MODEL_REGISTRY_PATH",
    ]
    missing = [name for name in required if not os.getenv(name)]
    if missing:
        raise ValueError(f"Missing worker environment values: {', '.join(missing)}")
    db = SupabaseRest(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    weather = forecast_weather_provider_from_env()
    registry = ModelRegistry(Path(os.environ["MODEL_REGISTRY_PATH"]))
    allow_canary = os.getenv("ALLOW_EARLY_ACCESS_MODE", "false").strip().lower() == "true"
    models = {
        season: ModelBundle(registry.available_champion_path(season, allow_canary=allow_canary)[0])
        for season in ("open_water", "ice")
    }
    lakes = db.select(
        "lakes",
        {
            "select": "id,slug,name,region,lat,lon,clarity_class,area_km2,max_depth_m,timezone",
            "is_active": "eq.true",
        },
    )
    now = datetime.now(UTC).replace(minute=0, second=0, microsecond=0)
    end = now + timedelta(days=horizon_days)
    hourly_rows: list[dict] = []
    window_rows: list[dict] = []
    feature_rows: list[dict] = []
    audit_rows: list[dict] = []
    run_started_at = datetime.now(UTC).isoformat()

    for lake in lakes:
        raw_weather = weather.hourly(float(lake["lat"]), float(lake["lon"]), now, end)
        if raw_weather.empty:
            raise RuntimeError(f"Weather provider returned no forecast rows for {lake['slug']}")
        raw_weather["hour_start"] = pd.to_datetime(raw_weather["hour_start"], utc=True)
        for season, bundle in models.items():
            inputs, predictions = _prediction_plan(lake, raw_weather, season, bundle)
            for index, prediction in predictions.iterrows():
                raw = inputs.loc[index]
                features = _json_ready(raw.to_dict())
                features_hash = hashlib.sha256(json.dumps(features, sort_keys=True).encode()).hexdigest()
                feature_rows.append(
                    {
                        "lake_id": lake["id"],
                        "ts": pd.Timestamp(prediction["hour_start"]).isoformat(),
                        "season_mode": season,
                        "model_family": bundle.model_family,
                        "prediction_granularity": bundle.prediction_granularity,
                        "time_precision": str(prediction.get("time_precision", "exact")),
                        "feature_contract_version": bundle.metadata.get(
                            "feature_contract_version", FEATURE_CONTRACT_VERSION
                        ),
                        "features": features,
                        "source": weather.source_name,
                    }
                )
                audit_rows.append(
                    {
                        "lake_id": lake["id"],
                        "ts": pd.Timestamp(prediction["hour_start"]).isoformat(),
                        "season_mode": season,
                        "model_version": bundle.version,
                        "model_family": bundle.model_family,
                        "prediction_granularity": bundle.prediction_granularity,
                        "time_precision": str(prediction.get("time_precision", "exact")),
                        "raw_probability": float(prediction["raw_probability"]),
                        "bite_score": int(prediction["bite_score"]),
                        "confidence_score": float(prediction["confidence_score"]),
                        "features_hash": features_hash,
                    }
                )
                if not bool(prediction["forecast_available"]):
                    continue
                hourly_rows.append(
                    {
                        "lake_id": lake["id"],
                        "species": "walleye",
                        "season_mode": season,
                        "ts": pd.Timestamp(prediction["hour_start"]).isoformat(),
                        "model_family": bundle.model_family,
                        "prediction_granularity": bundle.prediction_granularity,
                        "time_precision": str(prediction.get("time_precision", "exact")),
                        "score": int(prediction["bite_score"]),
                        "light": float(max(0, min(1, ((raw.get("solar_elevation_deg", -6) or -6) + 6) / 56))),
                        "components": {
                            "raw_probability": float(prediction["raw_probability"]),
                            "confidence_score": float(prediction["confidence_score"]),
                            "cloud_pct": _optional_float(raw.get("cloud_pct")),
                            "wind_kmh": _optional_float(raw.get("wind_kmh")),
                            "precipitation_mm": _optional_float(raw.get("precip_mm")),
                            "pressure_hpa": _optional_float(raw.get("pressure_hpa")),
                            "moon_illumination": _optional_float(raw.get("moon_illumination")),
                            "solar_elevation_deg": _optional_float(raw.get("solar_elevation_deg")),
                            "time_block": prediction.get("time_block"),
                            "score_basis": bundle.metadata.get(
                                "score_basis", "historical_reference_percentile"
                            ),
                            "deployment_stage": bundle.metadata.get(
                                "deployment_stage", "production_candidate"
                            ),
                        },
                        "reasons": prediction["reasons"],
                        "confidence": prediction["confidence"],
                        "engine_version": bundle.version,
                        "computed_at": run_started_at,
                    }
                )
            windows = forecast_windows(predictions[predictions["forecast_available"]])
            for window in windows:
                in_window = predictions[
                    (pd.to_datetime(predictions["hour_start"], utc=True) >= window.start)
                    & (pd.to_datetime(predictions["hour_start"], utc=True) < window.end)
                ]
                peak = in_window.loc[in_window["bite_score"].idxmax()]
                window_rows.append(
                    {
                        "lake_id": lake["id"],
                        "species": "walleye",
                        "season_mode": season,
                        "start_ts": window.start.isoformat(),
                        "end_ts": window.end.isoformat(),
                        "model_family": bundle.model_family,
                        "prediction_granularity": bundle.prediction_granularity,
                        "time_precision": str(peak.get("time_precision", "exact")),
                        "peak_score": window.peak_score,
                        "reasons": peak["reasons"],
                        "confidence": peak["confidence"],
                        "tactics_text": _tactics_text(
                            bundle.model_family,
                            bool(bundle.metadata.get("canary_only")),
                        ),
                        "engine_version": bundle.version,
                        "computed_at": run_started_at,
                    }
                )
    if lakes and not hourly_rows:
        raise RuntimeError(
            "Forecast run produced no publishable hourly rows; previous forecasts were preserved"
        )
    db.upsert("forecast_hourly", hourly_rows, "lake_id,species,season_mode,ts")
    db.upsert(
        "forecast_windows",
        window_rows,
        "lake_id,species,season_mode,start_ts,end_ts,engine_version",
    )
    db.upsert(
        "feature_snapshots",
        feature_rows,
        "lake_id,ts,season_mode,model_family,feature_contract_version",
    )
    db.upsert(
        "prediction_audits",
        audit_rows,
        "lake_id,ts,season_mode,model_version,prediction_granularity",
    )
    # Cleanup only after replacement rows are safely published. A provider or model failure
    # therefore leaves the previous forecast available instead of creating an empty app.
    db.delete(
        "forecast_hourly",
        {"ts": f"gte.{now.isoformat()}", "computed_at": f"lt.{run_started_at}"},
    )
    db.delete(
        "forecast_windows",
        {"start_ts": f"gte.{now.isoformat()}", "computed_at": f"lt.{run_started_at}"},
    )
    return {"lakes": len(lakes), "hourly_forecasts": len(hourly_rows), "windows": len(window_rows)}


def _prediction_plan(
    lake: dict,
    weather: pd.DataFrame,
    season: str,
    bundle: ModelBundle,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    if bundle.model_family == "hourly":
        inputs = _forecast_inputs(lake, weather, season).reset_index(drop=True)
        return inputs, bundle.predict(inputs).reset_index(drop=True)
    if bundle.model_family != "trip_broad":
        raise ValueError(f"Unsupported model family: {bundle.model_family}")
    blocks = forecast_time_blocks(lake, weather, season).reset_index(drop=True)
    block_predictions = bundle.predict(blocks).reset_index(drop=True)
    if bundle.metadata.get("canary_only"):
        score_cap = int(bundle.metadata.get("score_cap", 69))
        block_predictions["bite_score"] = (
            block_predictions["raw_probability"].rank(method="average", pct=True) * score_cap
        ).round().astype(int)
    predictions = expand_block_predictions(block_predictions, weather).reset_index(drop=True)
    input_rows: list[dict] = []
    for prediction in predictions.to_dict(orient="records"):
        start = pd.Timestamp(prediction["period_start"])
        match = blocks[pd.to_datetime(blocks["period_start"], utc=True).eq(start)]
        if match.empty:
            raise ValueError(f"No broad input block found for {start.isoformat()}")
        input_rows.append({**match.iloc[0].to_dict(), "hour_start": prediction["hour_start"]})
    return pd.DataFrame(input_rows), predictions


def _forecast_inputs(lake: dict, weather: pd.DataFrame, season: str) -> pd.DataFrame:
    rows: list[dict] = []
    timezone = lake.get("timezone") or "America/Toronto"
    for raw in weather.to_dict(orient="records"):
        moment = pd.Timestamp(raw["hour_start"]).to_pydatetime()
        rows.append(
            {
                **raw,
                **astronomy_features(moment, float(lake["lat"]), float(lake["lon"]), timezone),
                "lake_id": lake["slug"],
                "region": lake["region"],
                "latitude": lake["lat"],
                "longitude": lake["lon"],
                "hour_start": moment,
                "effort_minutes": 60,
                "season_mode": season,
                "method": "tip-up" if season == "ice" else "jig",
                "bait_category": "unknown",
                "water_clarity": lake.get("clarity_class") or "unknown",
                "lake_area_km2": lake.get("area_km2"),
                "lake_max_depth_m": lake.get("max_depth_m"),
            }
        )
    return pd.DataFrame(rows)


def _json_ready(value: dict) -> dict:
    cleaned = {}
    for key, item in value.items():
        if item is None or (not isinstance(item, (list, dict)) and pd.isna(item)):
            cleaned[key] = None
        elif isinstance(item, (datetime, pd.Timestamp)):
            cleaned[key] = item.isoformat()
        elif hasattr(item, "item"):
            cleaned[key] = item.item()
        else:
            cleaned[key] = item
    return json.loads(json.dumps(cleaned, default=str, allow_nan=False))


def _optional_float(value: object) -> float | None:
    if value is None or pd.isna(value):
        return None
    return float(value)


def _tactics_text(model_family: str, canary_only: bool = False) -> str:
    if canary_only:
        return (
            "Early-access relative outlook for the next three days. Confidence is Low; scores are not "
            "validated catch probabilities and do not promise fish or assess ice safety."
        )
    if model_family == "trip_broad":
        return (
            "Broad time-block outlook from trip-level evidence; confidence is Low and the model does not "
            "identify an exact peak hour. Choose legal tactics suited to the lake and season."
        )
    return "Model-derived conditions forecast; choose legal tactics suited to the lake and season."
