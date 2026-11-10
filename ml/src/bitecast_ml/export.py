from __future__ import annotations

import hashlib
import hmac

import pandas as pd

from .ingestion import expand_trip_to_angler_hours
from .supabase_rest import SupabaseRest


def export_consented_logs(db: SupabaseRest, pseudonym_key: str) -> pd.DataFrame:
    lakes = db.select("lakes", {"select": "id,slug,region,lat,lon,clarity_class,area_km2,max_depth_m"})
    lake_by_id = {lake["id"]: lake for lake in lakes}
    logs = db.select(
        "catch_logs",
        {
            "select": "*",
            "training_consent": "eq.true",
            "deleted_at": "is.null",
            "trip_started_at": "not.is.null",
            "trip_ended_at": "not.is.null",
        },
    )
    observations: list[dict] = []
    for log in logs:
        lake = lake_by_id.get(log["lake_id"])
        if not lake:
            continue
        conditions = log.get("conditions") or {}
        trip = {
            "trip_id": log["id"],
            "anonymous_angler_id": _pseudonym(log["user_id"], pseudonym_key),
            "lake_id": lake["slug"],
            "region": lake["region"],
            "latitude": lake["lat"],
            "longitude": lake["lon"],
            "trip_started_at": log["trip_started_at"],
            "trip_ended_at": log["trip_ended_at"],
            "caught_at": log["caught_at"],
            "caught": log["caught"],
            "catch_count": log["count"],
            "species": log.get("species") or "walleye",
            "season_mode": log.get("season_mode") or "open_water",
            "method": log.get("method") or "other",
            "bait_category": log.get("bait_category") or log.get("bait") or "unknown",
            "fishing_depth_m": log.get("depth_m"),
            "water_depth_m": log.get("water_depth_m"),
            "water_clarity": log.get("clarity") or lake.get("clarity_class") or "unknown",
            "air_temp_c": conditions.get("temperatureC"),
            "water_temp_c": conditions.get("waterTemperatureC"),
            "wind_kmh": conditions.get("windKmh"),
            "gust_kmh": conditions.get("gustKmh"),
            "wind_direction_deg": conditions.get("windDirectionDeg"),
            "cloud_pct": conditions.get("cloudPct"),
            "precip_mm": conditions.get("precipMm"),
            "pressure_hpa": conditions.get("pressureHpa"),
            "pressure_change_3h_hpa": conditions.get("pressureChange3hHpa"),
            "solar_elevation_deg": conditions.get("solarElevationDeg"),
            "minutes_from_sunrise": conditions.get("minutesFromSunrise"),
            "minutes_from_sunset": conditions.get("minutesFromSunset"),
            "moon_illumination": conditions.get("moonIllumination"),
            "lake_area_km2": lake.get("area_km2"),
            "lake_max_depth_m": lake.get("max_depth_m"),
            "source": "bitecast-user-log",
            "source_quality": 1.0,
            "training_consent": True,
        }
        observations.extend(expand_trip_to_angler_hours(trip))
    return pd.DataFrame(observations)


def _pseudonym(user_id: str, key: str) -> str:
    return hmac.new(key.encode(), user_id.encode(), hashlib.sha256).hexdigest()
