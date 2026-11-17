from __future__ import annotations

import pandas as pd

from .astronomy import astronomy_features
from .weather import HistoricalWeatherProvider, attach_weather

WEATHER_COLUMN_ALIASES = {
    "hour_start_utc": "hour_start",
    "wind_gust_kmh": "gust_kmh",
}
WEATHER_JOIN_COLUMNS = [
    "lake_id",
    "hour_start",
    "air_temp_c",
    "precip_mm",
    "cloud_pct",
    "pressure_hpa",
    "pressure_change_3h_hpa",
    "wind_kmh",
    "gust_kmh",
    "wind_direction_deg",
]


def enrich_observations(
    observations: pd.DataFrame,
    historical_weather: pd.DataFrame,
    default_timezone: str = "America/Toronto",
) -> pd.DataFrame:
    """Join historical measurements and calculate astronomy at the observed place and time."""
    enriched = attach_weather(observations, historical_weather)
    astronomy_rows = []
    for row in enriched.to_dict(orient="records"):
        moment = pd.Timestamp(row["hour_start"]).to_pydatetime()
        astronomy_rows.append(
            astronomy_features(
                moment,
                float(row["latitude"]),
                float(row["longitude"]),
                str(row.get("timezone") or default_timezone),
            )
        )
    astronomy = pd.DataFrame(astronomy_rows, index=enriched.index)
    for column in astronomy:
        enriched[column] = astronomy[column]
    return enriched


def enrich_from_normalized_environment(
    observations: pd.DataFrame,
    historical_weather: pd.DataFrame,
    water_conditions: pd.DataFrame | None = None,
    lake_clarity: pd.DataFrame | None = None,
    max_clarity_age_days: int = 1095,
) -> pd.DataFrame:
    """Join accepted outcomes to normalized repository/provider environmental tables.

    Weather must match the exact lake-hour. Water temperature matches lake-date. Clarity uses only an
    observation at or before the trip, bounded by ``max_clarity_age_days`` to prevent future leakage and
    indefinitely stale measurements.
    """
    weather = historical_weather.rename(columns=WEATHER_COLUMN_ALIASES).copy()
    weather = weather[[column for column in WEATHER_JOIN_COLUMNS if column in weather]]
    enriched = enrich_observations(observations, weather)

    if water_conditions is not None and not water_conditions.empty:
        water = water_conditions.copy()
        water["environment_date"] = pd.to_datetime(water["observed_on"], utc=True).dt.date
        enriched["environment_date"] = pd.to_datetime(enriched["hour_start"], utc=True).dt.date
        water = water.rename(columns={"surface_water_temp_c": "water_temp_c"})
        enriched = enriched.drop(columns=["water_temp_c"], errors="ignore").merge(
            water[["lake_id", "environment_date", "water_temp_c"]],
            on=["lake_id", "environment_date"],
            how="left",
            validate="many_to_one",
        )
        enriched = enriched.drop(columns=["environment_date"])

    if lake_clarity is not None and not lake_clarity.empty:
        enriched = _attach_prior_clarity(enriched, lake_clarity, max_clarity_age_days)
    return enriched


def enrich_from_weather_provider(
    observations: pd.DataFrame,
    provider: HistoricalWeatherProvider,
) -> pd.DataFrame:
    """Fetch historical weather for outcome coverage and join it by exact lake-hour."""
    weather_frames = []
    for lake_id, rows in observations.groupby("lake_id"):
        times = pd.to_datetime(rows["hour_start"], utc=True)
        weather = provider.hourly(
            float(rows["latitude"].iloc[0]),
            float(rows["longitude"].iloc[0]),
            times.min().to_pydatetime(),
            times.max().to_pydatetime(),
        ).copy()
        weather["lake_id"] = lake_id
        weather_frames.append(weather)
    if not weather_frames:
        return observations.copy()
    return enrich_observations(observations, pd.concat(weather_frames, ignore_index=True))


def _attach_prior_clarity(
    observations: pd.DataFrame, clarity: pd.DataFrame, max_age_days: int
) -> pd.DataFrame:
    left = observations.copy()
    left["_original_order"] = range(len(left))
    left["_observation_time"] = pd.to_datetime(left["hour_start"], utc=True)
    right = clarity.copy()
    right["_clarity_time"] = pd.to_datetime(right["observed_on"], utc=True)
    joined_lakes = []
    for lake_id, lake_rows in left.groupby("lake_id", sort=False):
        lake_clarity = right.loc[right["lake_id"] == lake_id].sort_values("_clarity_time")
        lake_rows = lake_rows.sort_values("_observation_time")
        if lake_clarity.empty:
            lake_rows["secchi_depth_m"] = pd.NA
            joined_lakes.append(lake_rows)
            continue
        joined_lakes.append(
            pd.merge_asof(
                lake_rows,
                lake_clarity[["_clarity_time", "secchi_depth_m"]],
                left_on="_observation_time",
                right_on="_clarity_time",
                direction="backward",
                tolerance=pd.Timedelta(days=max_age_days),
            )
        )
    return (
        pd.concat(joined_lakes, ignore_index=True)
        .sort_values("_original_order")
        .drop(columns=["_original_order", "_observation_time", "_clarity_time"], errors="ignore")
        .reset_index(drop=True)
    )
