from __future__ import annotations

import math

import numpy as np
import pandas as pd

CATEGORICAL_FEATURES = [
    "lake_id",
    "region",
    "season_mode",
    "method",
    "bait_category",
    "water_clarity",
]

BASE_NUMERIC_FEATURES = [
    "latitude",
    "longitude",
    "effort_minutes",
    "fishing_depth_m",
    "water_depth_m",
    "air_temp_c",
    "water_temp_c",
    "wind_kmh",
    "gust_kmh",
    "cloud_pct",
    "precip_mm",
    "pressure_hpa",
    "pressure_change_3h_hpa",
    "solar_elevation_deg",
    "minutes_from_sunrise",
    "minutes_from_sunset",
    "moon_illumination",
    "lake_area_km2",
    "lake_max_depth_m",
]

DERIVED_NUMERIC_FEATURES = [
    "hour_sin",
    "hour_cos",
    "day_of_year_sin",
    "day_of_year_cos",
    "wind_direction_sin",
    "wind_direction_cos",
]

NUMERIC_FEATURES = BASE_NUMERIC_FEATURES + DERIVED_NUMERIC_FEATURES
FEATURE_COLUMNS = CATEGORICAL_FEATURES + NUMERIC_FEATURES
TARGET_COLUMN = "caught"


def make_feature_frame(frame: pd.DataFrame) -> pd.DataFrame:
    """Create the exact named feature matrix shared by training and inference."""
    data = frame.copy()
    times = pd.to_datetime(data["hour_start"], utc=True)
    hour = times.dt.hour + times.dt.minute / 60
    day = times.dt.day_of_year
    wind_direction = pd.to_numeric(data.get("wind_direction_deg"), errors="coerce")

    data["hour_sin"] = np.sin(2 * math.pi * hour / 24)
    data["hour_cos"] = np.cos(2 * math.pi * hour / 24)
    data["day_of_year_sin"] = np.sin(2 * math.pi * day / 365.25)
    data["day_of_year_cos"] = np.cos(2 * math.pi * day / 365.25)
    data["wind_direction_sin"] = np.sin(np.deg2rad(wind_direction))
    data["wind_direction_cos"] = np.cos(np.deg2rad(wind_direction))

    for column in CATEGORICAL_FEATURES:
        if column not in data:
            data[column] = "unknown"
        data[column] = data[column].fillna("unknown").astype(str)
    for column in BASE_NUMERIC_FEATURES:
        if column not in data:
            data[column] = np.nan
        data[column] = pd.to_numeric(data[column], errors="coerce").astype(float)
    return data[FEATURE_COLUMNS]


def training_weights(frame: pd.DataFrame) -> np.ndarray:
    """Weight by observation quality and represented effort without rewarding long trips excessively."""
    quality = pd.to_numeric(frame.get("source_quality", 1.0), errors="coerce").fillna(0.5).clip(0.05, 1)
    effort = pd.to_numeric(frame.get("effort_minutes", 60), errors="coerce").fillna(60).clip(1, 60) / 60
    weights = quality * np.sqrt(effort)
    if "anonymous_angler_id" in frame:
        counts = frame["anonymous_angler_id"].fillna("unknown").value_counts()
        contributor_weight = (
            frame["anonymous_angler_id"].fillna("unknown").map(lambda key: 1 / math.sqrt(counts[key]))
        )
        contributor_weight /= contributor_weight.mean()
        weights *= contributor_weight
    return weights.to_numpy(dtype=float)
