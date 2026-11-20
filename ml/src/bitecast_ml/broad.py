from __future__ import annotations

import math
from typing import Any

import numpy as np
import pandas as pd

from .astronomy import astronomy_features
from .features import BASE_NUMERIC_FEATURES, CATEGORICAL_FEATURES, DERIVED_NUMERIC_FEATURES
from .weather import HistoricalWeatherProvider

BROAD_CATEGORICAL_FEATURES = CATEGORICAL_FEATURES + [
    "time_block",
    "time_precision",
    "effort_known",
]
BROAD_EXTRA_NUMERIC_FEATURES = [
    "window_hours",
    "air_temp_range_c",
    "wind_range_kmh",
    "pressure_range_hpa",
]
BROAD_NUMERIC_FEATURES = BASE_NUMERIC_FEATURES + BROAD_EXTRA_NUMERIC_FEATURES + DERIVED_NUMERIC_FEATURES
BROAD_FEATURE_COLUMNS = BROAD_CATEGORICAL_FEATURES + BROAD_NUMERIC_FEATURES

BLOCK_RANGES = {
    "overnight": (0, 5),
    "morning": (5, 12),
    "afternoon": (12, 17),
    "evening": (17, 22),
    "night": (22, 24),
}


def make_broad_feature_frame(frame: pd.DataFrame) -> pd.DataFrame:
    """Build the separate trip/time-block feature contract."""
    data = frame.copy()
    starts = pd.to_datetime(data["period_start"], utc=True)
    ends = pd.to_datetime(data["period_end"], utc=True)
    midpoint = starts + (ends - starts) / 2
    hour = midpoint.dt.hour + midpoint.dt.minute / 60
    day = midpoint.dt.day_of_year
    wind_direction = pd.to_numeric(data.get("wind_direction_deg"), errors="coerce")

    data["hour_sin"] = np.sin(2 * math.pi * hour / 24)
    data["hour_cos"] = np.cos(2 * math.pi * hour / 24)
    data["day_of_year_sin"] = np.sin(2 * math.pi * day / 365.25)
    data["day_of_year_cos"] = np.cos(2 * math.pi * day / 365.25)
    data["wind_direction_sin"] = np.sin(np.deg2rad(wind_direction))
    data["wind_direction_cos"] = np.cos(np.deg2rad(wind_direction))
    data["window_hours"] = (ends - starts).dt.total_seconds() / 3600

    for column in BROAD_CATEGORICAL_FEATURES:
        if column not in data:
            data[column] = "unknown"
        data[column] = data[column].fillna("unknown").astype(str).str.lower()
    for column in BASE_NUMERIC_FEATURES + BROAD_EXTRA_NUMERIC_FEATURES:
        if column not in data:
            data[column] = np.nan
        data[column] = pd.to_numeric(data[column], errors="coerce").astype(float)
    return data[BROAD_FEATURE_COLUMNS]


def broad_training_weights(frame: pd.DataFrame) -> np.ndarray:
    """Downweight imprecise reports while retaining them as honest trip-level evidence."""
    quality = pd.to_numeric(frame.get("source_quality", 0.25), errors="coerce")
    if not isinstance(quality, pd.Series):
        quality = pd.Series(float(quality), index=frame.index)
    quality = quality.fillna(0.25).clip(0.05, 1)
    precision = frame.get("time_precision", pd.Series("unknown", index=frame.index)).astype(str).map(
        {"exact": 1.0, "time_block": 0.80, "day": 0.55, "unknown": 0.35}
    ).fillna(0.35)
    effort = pd.to_numeric(frame.get("effort_minutes"), errors="coerce")
    if not isinstance(effort, pd.Series):
        effort = pd.Series(np.nan, index=frame.index)
    effort_factor = np.sqrt(effort.fillna(60).clip(1, 240) / 240).clip(lower=0.35)
    weights = quality * precision * effort_factor
    if "anonymous_angler_id" in frame:
        keys = frame["anonymous_angler_id"].fillna("unknown")
        counts = keys.value_counts()
        contributor = keys.map(lambda key: 1 / math.sqrt(counts[key]))
        contributor /= contributor.mean()
        weights *= contributor
    return weights.to_numpy(dtype=float)


def enrich_broad_observations(
    observations: pd.DataFrame,
    historical_weather: pd.DataFrame,
    default_timezone: str = "America/Toronto",
) -> pd.DataFrame:
    """Aggregate hourly environment over each report's honest uncertainty period."""
    weather = historical_weather.rename(columns={"hour_start_utc": "hour_start"}).copy()
    if "hour_start" not in weather:
        weather["hour_start"] = pd.Series(dtype="datetime64[ns, UTC]")
    if "lake_id" not in weather:
        weather["lake_id"] = pd.Series(dtype="object")
    weather["hour_start"] = pd.to_datetime(weather["hour_start"], utc=True)
    rows: list[dict[str, Any]] = []
    for observation in observations.to_dict(orient="records"):
        start = pd.Timestamp(observation["period_start"])
        end = pd.Timestamp(observation["period_end"])
        if start.tzinfo is None or end.tzinfo is None:
            raise ValueError("Broad observation periods must include a timezone")
        matching = weather[
            weather["lake_id"].astype(str).eq(str(observation["lake_id"]))
            & weather["hour_start"].ge(start)
            & weather["hour_start"].lt(end)
        ]
        enriched = {**observation, **_aggregate_weather(matching)}
        midpoint = (start + (end - start) / 2).to_pydatetime()
        enriched.update(
            astronomy_features(
                midpoint,
                float(observation["latitude"]),
                float(observation["longitude"]),
                str(observation.get("timezone") or default_timezone),
            )
        )
        rows.append(enriched)
    return pd.DataFrame(rows)


def enrich_broad_from_weather_provider(
    observations: pd.DataFrame,
    provider: HistoricalWeatherProvider,
) -> pd.DataFrame:
    """Fetch period-matched historical weather, then aggregate it without inventing an hour label."""
    frames: list[pd.DataFrame] = []
    for observation in observations.to_dict(orient="records"):
        start = pd.Timestamp(observation["period_start"])
        end = pd.Timestamp(observation["period_end"])
        weather = provider.hourly(
            float(observation["latitude"]),
            float(observation["longitude"]),
            start.to_pydatetime(),
            end.to_pydatetime(),
        ).copy()
        weather["lake_id"] = observation["lake_id"]
        frames.append(weather)
    weather = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()
    return enrich_broad_observations(observations, weather)


def forecast_time_blocks(lake: dict, weather: pd.DataFrame, season: str) -> pd.DataFrame:
    """Aggregate forecast hours into explicit local time blocks for the broad fallback model."""
    timezone = str(lake.get("timezone") or "America/Toronto")
    data = weather.copy()
    data["hour_start"] = pd.to_datetime(data["hour_start"], utc=True)
    local = data["hour_start"].dt.tz_convert(timezone)
    data["_local_date"] = local.dt.date
    data["time_block"] = local.dt.hour.map(_time_block)
    blocks: list[dict[str, Any]] = []
    for (local_date, block_name), group in data.groupby(["_local_date", "time_block"], sort=True):
        del local_date
        start = group["hour_start"].min()
        end = group["hour_start"].max() + pd.Timedelta(hours=1)
        midpoint = (start + (end - start) / 2).to_pydatetime()
        blocks.append(
            {
                "lake_id": lake["slug"],
                "region": lake["region"],
                "latitude": lake["lat"],
                "longitude": lake["lon"],
                "period_start": start,
                "period_end": end,
                "time_precision": "time_block",
                "time_block": block_name,
                "effort_known": False,
                "season_mode": season,
                "method": "tip-up" if season == "ice" else "jig",
                "bait_category": "unknown",
                "water_clarity": lake.get("clarity_class") or "unknown",
                "lake_area_km2": lake.get("area_km2"),
                "lake_max_depth_m": lake.get("max_depth_m"),
                **_aggregate_weather(group),
                **astronomy_features(
                    midpoint,
                    float(lake["lat"]),
                    float(lake["lon"]),
                    timezone,
                ),
            }
        )
    return pd.DataFrame(blocks)


def expand_block_predictions(predictions: pd.DataFrame, weather: pd.DataFrame) -> pd.DataFrame:
    """Repeat a broad score across its block without claiming distinct hourly inference."""
    rows: list[dict[str, Any]] = []
    moments = pd.to_datetime(weather["hour_start"], utc=True)
    for prediction in predictions.to_dict(orient="records"):
        start = pd.Timestamp(prediction["period_start"])
        end = pd.Timestamp(prediction["period_end"])
        for moment in moments[(moments >= start) & (moments < end)]:
            rows.append(
                {
                    **prediction,
                    "hour_start": moment,
                    "confidence": "Low",
                    "confidence_score": min(float(prediction["confidence_score"]), 0.44),
                    "prediction_granularity": "time_block",
                }
            )
    return pd.DataFrame(rows)


def broad_confidence_for_rows(
    raw_rows: pd.DataFrame,
    ensemble_predictions: np.ndarray,
    lake_counts: dict[str, int],
    known_categories: dict[str, list[str]],
) -> tuple[np.ndarray, list[str]]:
    numeric = [
        column
        for column in BASE_NUMERIC_FEATURES + BROAD_EXTRA_NUMERIC_FEATURES
        if column in raw_rows
    ]
    missing = raw_rows.reindex(columns=numeric).isna().mean(axis=1).to_numpy()
    disagreement = (
        ensemble_predictions.std(axis=0) if len(ensemble_predictions) > 1 else np.zeros(len(raw_rows))
    )
    counts = raw_rows["lake_id"].astype(str).map(lake_counts).fillna(0).to_numpy(dtype=float)
    coverage = np.clip(np.log1p(counts) / np.log1p(500), 0, 1)
    precision = raw_rows["time_precision"].astype(str).map(
        {"exact": 1.0, "time_block": 0.75, "day": 0.50, "unknown": 0.25}
    ).fillna(0.25).to_numpy()
    unknown_penalty = np.zeros(len(raw_rows))
    for column, values in known_categories.items():
        if column in raw_rows:
            unknown_penalty += (~raw_rows[column].astype(str).isin(values)).to_numpy() * 0.08
    score = (
        0.35 * coverage
        + 0.25 * (1 - missing)
        + 0.20 * np.clip(1 - disagreement / 0.15, 0, 1)
        + 0.20 * precision
    )
    score = np.clip(score - unknown_penalty, 0, 1)
    labels = ["High" if value >= 0.72 else "Medium" if value >= 0.45 else "Low" for value in score]
    return score, labels


def _aggregate_weather(frame: pd.DataFrame) -> dict[str, float | None]:
    def mean(column: str) -> float | None:
        values = pd.to_numeric(frame.get(column), errors="coerce")
        return float(values.mean()) if isinstance(values, pd.Series) and values.notna().any() else None

    def total(column: str) -> float | None:
        values = pd.to_numeric(frame.get(column), errors="coerce")
        return float(values.sum()) if isinstance(values, pd.Series) and values.notna().any() else None

    def span(column: str) -> float | None:
        values = pd.to_numeric(frame.get(column), errors="coerce")
        if isinstance(values, pd.Series) and values.notna().any():
            return float(values.max() - values.min())
        return None

    direction = pd.to_numeric(frame.get("wind_direction_deg"), errors="coerce")
    circular_direction = None
    if isinstance(direction, pd.Series) and direction.notna().any():
        radians = np.deg2rad(direction.dropna())
        circular_direction = float(
            np.rad2deg(np.arctan2(np.sin(radians).mean(), np.cos(radians).mean())) % 360
        )
    return {
        "air_temp_c": mean("air_temp_c"),
        "air_temp_range_c": span("air_temp_c"),
        "water_temp_c": mean("water_temp_c"),
        "wind_kmh": mean("wind_kmh"),
        "wind_range_kmh": span("wind_kmh"),
        "gust_kmh": mean("gust_kmh"),
        "wind_direction_deg": circular_direction,
        "cloud_pct": mean("cloud_pct"),
        "precip_mm": total("precip_mm"),
        "pressure_hpa": mean("pressure_hpa"),
        "pressure_range_hpa": span("pressure_hpa"),
        "pressure_change_3h_hpa": mean("pressure_change_3h_hpa"),
    }


def _time_block(hour: int) -> str:
    return next(name for name, (start, end) in BLOCK_RANGES.items() if start <= hour < end)
