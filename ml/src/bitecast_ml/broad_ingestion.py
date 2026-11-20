from __future__ import annotations

import hashlib
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

import pandas as pd

from .broad import enrich_broad_observations

LAKE_CONTEXT = {
    "lake-erie": {
        "region": "Great Lakes",
        "latitude": 42.2,
        "longitude": -81.2,
        "water_clarity": "stained",
        "lake_area_km2": 25700,
        "lake_max_depth_m": 64,
        "timezone": "America/Toronto",
    },
    "bay-of-quinte": {
        "region": "Eastern Ontario",
        "latitude": 44.16,
        "longitude": -77.18,
        "water_clarity": "stained",
        "lake_area_km2": 320,
        "lake_max_depth_m": 30,
        "timezone": "America/Toronto",
    },
}


def longpoint_reports_to_broad(
    reports: pd.DataFrame,
    authorize_source: bool = False,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Convert only technically usable forum outcomes to honest day-level training candidates."""
    accepted: list[dict] = []
    rejected: list[dict] = []
    for raw in reports.to_dict(orient="records"):
        reasons = []
        if str(raw.get("species") or "").lower() != "walleye":
            reasons.append("not_walleye")
        if not raw.get("report_date") or pd.isna(raw.get("report_date")):
            reasons.append("missing_report_date")
        lake_id = raw.get("lake_id")
        if not lake_id or pd.isna(lake_id) or str(lake_id) not in LAKE_CONTEXT:
            reasons.append("missing_supported_lake")
        if raw.get("caught") is None or pd.isna(raw.get("caught")):
            reasons.append("missing_outcome")
        if not authorize_source:
            reasons.append("source_not_authorized_for_training")
        if reasons:
            rejected.append(
                {
                    "record_id": raw.get("record_id"),
                    "source_url": raw.get("source_url"),
                    "reasons": "|".join(reasons),
                }
            )
            continue

        lake = LAKE_CONTEXT[str(lake_id)]
        report_date = pd.Timestamp(raw["report_date"]).date()
        zone = ZoneInfo(str(lake["timezone"]))
        period_start = datetime.combine(report_date, time.min, tzinfo=zone)
        period_end = period_start + timedelta(days=1)
        caught = bool(raw["caught"])
        raw_count = raw.get("catch_count")
        catch_count = None if raw_count is None or pd.isna(raw_count) else int(raw_count)
        effort = raw.get("effort_minutes")
        effort_minutes = None if effort is None or pd.isna(effort) else int(effort)
        observation_id = f"longpoint-broad-{raw['record_id']}"
        accepted.append(
            {
                "observation_id": observation_id,
                "trip_id": observation_id,
                "anonymous_angler_id": raw.get("contributor_hash")
                if not pd.isna(raw.get("contributor_hash"))
                else None,
                "lake_id": lake_id,
                "region": lake["region"],
                "latitude": lake["latitude"],
                "longitude": lake["longitude"],
                "period_start": period_start.isoformat(),
                "period_end": period_end.isoformat(),
                "time_precision": "day",
                "time_block": "day",
                "label_granularity": "trip",
                "effort_minutes": effort_minutes,
                "effort_known": effort_minutes is not None,
                "caught": caught,
                "catch_count": catch_count,
                "species": "walleye",
                "season_mode": _season_mode(report_date.month),
                "method": _method(raw.get("method")),
                "bait_category": "unknown",
                "fishing_depth_m": _optional_float(raw.get("fishing_depth_m")),
                "water_depth_m": _optional_float(raw.get("water_depth_m")),
                "water_clarity": lake["water_clarity"],
                "lake_area_km2": lake["lake_area_km2"],
                "lake_max_depth_m": lake["lake_max_depth_m"],
                "source": "longpoint-forum-trip-report",
                "source_url": raw.get("source_url"),
                "source_quality": 0.20,
                "training_authorized": True,
            }
        )
    return pd.DataFrame(accepted), pd.DataFrame(rejected)


def broad_dataset_hash(frame: pd.DataFrame) -> str:
    hashed = pd.util.hash_pandas_object(frame.sort_values("observation_id"), index=False).values.tobytes()
    return hashlib.sha256(hashed).hexdigest()


def aggregate_hourly_logs_to_broad(hourly: pd.DataFrame) -> pd.DataFrame:
    """Let precise consented logs train both families while preserving separate labels."""
    if hourly.empty:
        return pd.DataFrame()
    rows: list[dict] = []
    for trip_id, trip in hourly.groupby("trip_id", sort=False):
        trip = trip.copy()
        moments = pd.to_datetime(trip["hour_start"], utc=True)
        first = trip.iloc[0]
        start = moments.min()
        end = moments.max() + pd.Timedelta(hours=1)
        blocks = {_time_block_for_hour(int(hour)) for hour in moments.dt.hour}
        caught = bool(trip["caught"].astype(bool).any())
        catch_counts = pd.to_numeric(trip.get("catch_count"), errors="coerce")
        effort = pd.to_numeric(trip.get("effort_minutes"), errors="coerce")
        rows.append(
            {
                "observation_id": f"broad-user-{trip_id}",
                "trip_id": str(trip_id),
                "anonymous_angler_id": first.get("anonymous_angler_id"),
                "lake_id": first["lake_id"],
                "region": first.get("region", "unknown"),
                "latitude": first["latitude"],
                "longitude": first["longitude"],
                "period_start": start,
                "period_end": end,
                "time_precision": "exact",
                "time_block": next(iter(blocks)) if len(blocks) == 1 else "multi_block",
                "label_granularity": "trip",
                "effort_minutes": int(effort.sum()) if effort.notna().any() else None,
                "effort_known": bool(effort.notna().any()),
                "caught": caught,
                "catch_count": int(catch_counts.sum()) if catch_counts.notna().any() else None,
                "species": "walleye",
                "season_mode": first["season_mode"],
                "method": _mode(trip.get("method"), "other"),
                "bait_category": _mode(trip.get("bait_category"), "unknown"),
                "fishing_depth_m": _mean(trip.get("fishing_depth_m")),
                "water_depth_m": _mean(trip.get("water_depth_m")),
                "water_clarity": _mode(trip.get("water_clarity"), "unknown"),
                "secchi_depth_m": _mean(trip.get("secchi_depth_m")),
                "lake_area_km2": _mean(trip.get("lake_area_km2")),
                "lake_max_depth_m": _mean(trip.get("lake_max_depth_m")),
                "source": "bitecast-user-trip-aggregate",
                "source_url": None,
                "source_quality": float(
                    pd.to_numeric(trip.get("source_quality"), errors="coerce").fillna(1).mean()
                ),
                "training_authorized": bool(trip.get("training_consent", False).astype(bool).all()),
            }
        )
    return enrich_broad_observations(pd.DataFrame(rows), hourly)


def _season_mode(month: int) -> str:
    return "ice" if month in {1, 2, 3} else "open_water"


def _method(value: object) -> str:
    normalized = str(value or "other").lower()
    return normalized if normalized in {"jig", "troll", "tip-up", "cast"} else "other"


def _optional_float(value: object) -> float | None:
    return None if value is None or pd.isna(value) else float(value)


def _mode(values: object, default: str) -> str:
    if not isinstance(values, pd.Series):
        return default
    clean = values.dropna().astype(str)
    return str(clean.mode().iloc[0]) if not clean.empty else default


def _mean(values: object) -> float | None:
    numeric = pd.to_numeric(values, errors="coerce")
    return float(numeric.mean()) if isinstance(numeric, pd.Series) and numeric.notna().any() else None


def _time_block_for_hour(hour: int) -> str:
    if hour < 5:
        return "overnight"
    if hour < 12:
        return "morning"
    if hour < 17:
        return "afternoon"
    if hour < 22:
        return "evening"
    return "night"
