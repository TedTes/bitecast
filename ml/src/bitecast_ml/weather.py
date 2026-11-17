from __future__ import annotations

import os
import time
from abc import ABC, abstractmethod
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path

import httpx
import pandas as pd


class HistoricalWeatherProvider(ABC):
    source_name = "unknown-weather-provider"

    @abstractmethod
    def hourly(self, latitude: float, longitude: float, start: datetime, end: datetime) -> pd.DataFrame:
        """Return UTC rows containing hour_start and weather feature columns."""


class FileWeatherProvider(HistoricalWeatherProvider):
    source_name = "file-weather"

    def __init__(self, path: Path) -> None:
        self.path = path

    def hourly(self, latitude: float, longitude: float, start: datetime, end: datetime) -> pd.DataFrame:
        del latitude, longitude
        frame = _read_frame(self.path)
        times = pd.to_datetime(frame["hour_start"], utc=True)
        return frame.loc[(times >= start) & (times <= end)].copy()


class ContractHttpWeatherProvider(HistoricalWeatherProvider):
    """Provider-neutral adapter; the licensed service must implement this response contract."""

    def __init__(self, base_url: str, api_key: str, timeout: float = 30) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout

    def hourly(self, latitude: float, longitude: float, start: datetime, end: datetime) -> pd.DataFrame:
        response = httpx.get(
            f"{self.base_url}/historical/hourly",
            params={
                "latitude": latitude,
                "longitude": longitude,
                "start": start.isoformat(),
                "end": end.isoformat(),
            },
            headers={"Authorization": f"Bearer {self.api_key}"},
            timeout=self.timeout,
        )
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload.get("hours"), list):
            raise ValueError("weather provider must return an hours array")
        return pd.DataFrame(payload["hours"])


OPEN_METEO_HOURLY_COLUMNS = {
    "temperature_2m": "air_temp_c",
    "precipitation": "precip_mm",
    "pressure_msl": "pressure_hpa",
    "cloud_cover": "cloud_pct",
    "wind_speed_10m": "wind_kmh",
    "wind_direction_10m": "wind_direction_deg",
    "wind_gusts_10m": "gust_kmh",
}


class OpenMeteoForecastProvider(HistoricalWeatherProvider):
    """Commercial Open-Meteo forecast adapter with the BiteCast weather schema."""

    source_name = "open-meteo-commercial"

    def __init__(
        self,
        base_url: str,
        api_key: str,
        timeout: float = 30,
        retries: int = 3,
        client: httpx.Client | None = None,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        if not api_key.strip():
            raise ValueError("OPEN_METEO_API_KEY is required for commercial forecasts")
        self.url = _open_meteo_forecast_url(base_url)
        self.api_key = api_key
        self.timeout = timeout
        self.retries = max(1, retries)
        self.client = client
        self.sleep = sleep

    def hourly(self, latitude: float, longitude: float, start: datetime, end: datetime) -> pd.DataFrame:
        if end <= start:
            raise ValueError("weather forecast end must be after start")
        params = {
            "latitude": latitude,
            "longitude": longitude,
            "hourly": ",".join(OPEN_METEO_HOURLY_COLUMNS),
            "timezone": "UTC",
            "timeformat": "iso8601",
            "wind_speed_unit": "kmh",
            "temperature_unit": "celsius",
            "precipitation_unit": "mm",
            "start_hour": _open_meteo_hour(start),
            "end_hour": _open_meteo_hour(end),
            "cell_selection": "nearest",
            "apikey": self.api_key,
        }
        response = self._request(params)
        payload = response.json()
        hourly = payload.get("hourly")
        if not isinstance(hourly, dict) or not isinstance(hourly.get("time"), list):
            raise ValueError("Open-Meteo response must contain hourly.time")
        expected = len(hourly["time"])
        missing = [name for name in OPEN_METEO_HOURLY_COLUMNS if not isinstance(hourly.get(name), list)]
        if missing:
            raise ValueError(f"Open-Meteo response is missing hourly fields: {', '.join(missing)}")
        mismatched = [
            name for name in OPEN_METEO_HOURLY_COLUMNS if len(hourly[name]) != expected
        ]
        if mismatched:
            raise ValueError(f"Open-Meteo hourly fields have inconsistent lengths: {', '.join(mismatched)}")
        frame = pd.DataFrame(
            {
                "hour_start": pd.to_datetime(hourly["time"], utc=True),
                **{
                    target: pd.to_numeric(pd.Series(hourly[source]), errors="coerce")
                    for source, target in OPEN_METEO_HOURLY_COLUMNS.items()
                },
            }
        ).sort_values("hour_start")
        start_utc = _utc_timestamp(start)
        end_utc = _utc_timestamp(end)
        frame = frame.loc[frame["hour_start"].between(start_utc, end_utc)].reset_index(drop=True)
        frame["pressure_change_3h_hpa"] = frame["pressure_hpa"].diff(3)
        frame["source"] = self.source_name
        frame["fetched_at"] = datetime.now(UTC).isoformat()
        return frame

    def _request(self, params: dict[str, object]) -> httpx.Response:
        last_error: Exception | None = None
        for attempt in range(self.retries):
            try:
                request = self.client.get if self.client else httpx.get
                response = request(self.url, params=params, timeout=self.timeout)
                if response.status_code not in {429, 500, 502, 503, 504}:
                    response.raise_for_status()
                    return response
                last_error = httpx.HTTPStatusError(
                    f"Open-Meteo returned {response.status_code}",
                    request=response.request,
                    response=response,
                )
            except (httpx.TimeoutException, httpx.NetworkError) as error:
                last_error = error
            if attempt + 1 < self.retries:
                self.sleep(min(2**attempt, 4))
        assert last_error is not None
        raise last_error


def forecast_weather_provider_from_env() -> HistoricalWeatherProvider:
    provider = os.getenv("WEATHER_PROVIDER", "contract").strip().lower()
    if provider == "open_meteo":
        return OpenMeteoForecastProvider(
            os.getenv("OPEN_METEO_BASE_URL", "https://customer-api.open-meteo.com"),
            os.getenv("OPEN_METEO_API_KEY", ""),
        )
    if provider == "contract":
        base_url = os.getenv("WEATHER_API_BASE_URL", "")
        api_key = os.getenv("WEATHER_API_KEY", "")
        if not base_url or not api_key:
            raise ValueError("WEATHER_API_BASE_URL and WEATHER_API_KEY are required")
        return ContractHttpWeatherProvider(base_url, api_key)
    raise ValueError(f"Unsupported WEATHER_PROVIDER: {provider}")


def _open_meteo_forecast_url(base_url: str) -> str:
    normalized = base_url.strip().rstrip("/")
    if not normalized.startswith("https://"):
        raise ValueError("OPEN_METEO_BASE_URL must use HTTPS")
    if normalized.endswith("/v1/forecast"):
        return normalized
    return f"{normalized}/v1/forecast"


def _open_meteo_hour(value: datetime) -> str:
    moment = value.astimezone(UTC) if value.tzinfo else value.replace(tzinfo=UTC)
    return moment.replace(minute=0, second=0, microsecond=0).strftime("%Y-%m-%dT%H:%M")


def _utc_timestamp(value: datetime) -> pd.Timestamp:
    timestamp = pd.Timestamp(value)
    return timestamp.tz_convert("UTC") if timestamp.tzinfo else timestamp.tz_localize("UTC")


def attach_weather(observations: pd.DataFrame, weather: pd.DataFrame) -> pd.DataFrame:
    left = observations.copy()
    right = weather.copy()
    left["hour_start"] = pd.to_datetime(left["hour_start"], utc=True).dt.floor("h")
    right["hour_start"] = pd.to_datetime(right["hour_start"], utc=True).dt.floor("h")
    join_columns = ["hour_start"]
    if "lake_id" in left and "lake_id" in right:
        join_columns.insert(0, "lake_id")
    duplicate_columns = [
        column for column in right.columns if column in left.columns and column not in join_columns
    ]
    left = left.drop(columns=duplicate_columns, errors="ignore")
    joined = left.merge(right, on=join_columns, how="left", validate="many_to_one")
    if "pressure_hpa" in joined:
        joined = joined.sort_values(["lake_id", "hour_start"])
        joined["pressure_change_3h_hpa"] = joined.groupby("lake_id")["pressure_hpa"].diff(3)
    return joined


def _read_frame(path: Path) -> pd.DataFrame:
    return pd.read_parquet(path) if path.suffix == ".parquet" else pd.read_csv(path)
