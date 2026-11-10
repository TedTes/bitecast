from __future__ import annotations

import hashlib
import json
import os
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pandas as pd

from .astronomy import astronomy_features
from .contracts import FEATURE_CONTRACT_VERSION
from .model import ModelBundle
from .registry import ModelRegistry
from .scoring import forecast_windows
from .supabase_rest import SupabaseRest
from .weather import ContractHttpWeatherProvider


def run_forecast_worker(horizon_days: int = 7) -> dict[str, int]:
    required = [
        "SUPABASE_URL",
        "SUPABASE_SERVICE_ROLE_KEY",
        "WEATHER_API_BASE_URL",
        "WEATHER_API_KEY",
        "MODEL_REGISTRY_PATH",
    ]
    missing = [name for name in required if not os.getenv(name)]
    if missing:
        raise ValueError(f"Missing worker environment values: {', '.join(missing)}")
    db = SupabaseRest(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    weather = ContractHttpWeatherProvider(os.environ["WEATHER_API_BASE_URL"], os.environ["WEATHER_API_KEY"])
    registry = ModelRegistry(Path(os.environ["MODEL_REGISTRY_PATH"]))
    models = {season: ModelBundle(registry.champion_path(season)) for season in ("open_water", "ice")}
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
    db.delete("forecast_windows", {"start_ts": f"gte.{now.isoformat()}"})

    for lake in lakes:
        raw_weather = weather.hourly(float(lake["lat"]), float(lake["lon"]), now, end)
        if raw_weather.empty:
            continue
        raw_weather["hour_start"] = pd.to_datetime(raw_weather["hour_start"], utc=True)
        for season, bundle in models.items():
            inputs = _forecast_inputs(lake, raw_weather, season)
            predictions = bundle.predict(inputs)
            for index, prediction in predictions.iterrows():
                raw = inputs.loc[index]
                features = _json_ready(raw.to_dict())
                features_hash = hashlib.sha256(json.dumps(features, sort_keys=True).encode()).hexdigest()
                feature_rows.append(
                    {
                        "lake_id": lake["id"],
                        "ts": pd.Timestamp(prediction["hour_start"]).isoformat(),
                        "season_mode": season,
                        "feature_contract_version": FEATURE_CONTRACT_VERSION,
                        "features": features,
                        "source": "licensed-weather-forecast",
                    }
                )
                audit_rows.append(
                    {
                        "lake_id": lake["id"],
                        "ts": pd.Timestamp(prediction["hour_start"]).isoformat(),
                        "season_mode": season,
                        "model_version": bundle.version,
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
                        },
                        "reasons": prediction["reasons"],
                        "confidence": prediction["confidence"],
                        "engine_version": bundle.version,
                        "computed_at": datetime.now(UTC).isoformat(),
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
                        "peak_score": window.peak_score,
                        "reasons": peak["reasons"],
                        "confidence": peak["confidence"],
                        "tactics_text": (
                            "Model-derived conditions forecast; choose legal tactics "
                            "suited to the lake and season."
                        ),
                        "engine_version": bundle.version,
                        "computed_at": datetime.now(UTC).isoformat(),
                    }
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
        "lake_id,ts,season_mode,feature_contract_version",
    )
    db.upsert(
        "prediction_audits",
        audit_rows,
        "lake_id,ts,season_mode,model_version",
    )
    return {"lakes": len(lakes), "hourly_forecasts": len(hourly_rows), "windows": len(window_rows)}


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
