from __future__ import annotations

import os
import time
from abc import ABC, abstractmethod
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import UTC, datetime
from pathlib import Path
from xml.etree import ElementTree

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

ECCC_RDPS_LAYERS = {
    "RDPS_10km_AirTemp_2m": ("air_temp_c", 1.0),
    "RDPS_10km_Precip-Accum1h": ("precip_mm", 1.0),
    "RDPS_10km_Pressure_MSL": ("pressure_hpa", 0.01),
    "RDPS_10km_TotalCloudCover": ("cloud_pct", 1.0),
    "RDPS_10km_WindSpeed_10m": ("wind_kmh", 3.6),
    "RDPS_10km_WindDir_10m": ("wind_direction_deg", 1.0),
    "RDPS_10km_WindGust_10m": ("gust_kmh", 3.6),
}


class EcccRdpsForecastProvider(HistoricalWeatherProvider):
    """Anonymous ECCC RDPS point forecasts normalized to the BiteCast weather schema."""

    source_name = "eccc-rdps-10km"

    def __init__(
        self,
        base_url: str = "https://geo.weather.gc.ca/geomet",
        timeout: float = 30,
        retries: int = 3,
        max_concurrency: int = 8,
        client: httpx.Client | None = None,
        sleep: Callable[[float], None] = time.sleep,
        user_agent: str = "BiteCast/0.1 (+https://github.com/TedTes/bitecast)",
    ) -> None:
        normalized = base_url.strip().rstrip("/")
        if not normalized.startswith("https://"):
            raise ValueError("ECCC_BASE_URL must use HTTPS")
        self.base_url = normalized
        self.timeout = timeout
        self.retries = max(1, retries)
        self.max_concurrency = max(1, min(max_concurrency, 16))
        self.client = client or httpx.Client(headers={"User-Agent": user_agent})
        self.sleep = sleep

    def hourly(self, latitude: float, longitude: float, start: datetime, end: datetime) -> pd.DataFrame:
        if end <= start:
            raise ValueError("weather forecast end must be after start")
        times, reference_time = self._available_times(start, end)
        if not times:
            raise ValueError("ECCC RDPS has no forecast hours in the requested interval")

        rows = {moment: {"hour_start": moment} for moment in times}
        requests = [
            (moment, layer, target, multiplier)
            for moment in times
            for layer, (target, multiplier) in ECCC_RDPS_LAYERS.items()
        ]
        with ThreadPoolExecutor(max_workers=self.max_concurrency) as executor:
            futures = {
                executor.submit(self._point_value, latitude, longitude, moment, layer): (
                    moment,
                    target,
                    multiplier,
                )
                for moment, layer, target, multiplier in requests
            }
            for future in as_completed(futures):
                moment, target, multiplier = futures[future]
                value = future.result()
                rows[moment][target] = None if value is None else value * multiplier

        frame = pd.DataFrame(rows.values()).sort_values("hour_start").reset_index(drop=True)
        for target, _ in ECCC_RDPS_LAYERS.values():
            if target not in frame:
                frame[target] = None
            frame[target] = pd.to_numeric(frame[target], errors="coerce")
        required = ["air_temp_c", "wind_kmh", "cloud_pct", "pressure_hpa"]
        if frame[required].dropna(how="any").empty:
            raise ValueError("ECCC RDPS returned no complete core weather rows")
        frame["pressure_change_3h_hpa"] = frame["pressure_hpa"].diff(3)
        frame["source"] = self.source_name
        frame["source_reference_time"] = reference_time.isoformat()
        frame["fetched_at"] = datetime.now(UTC).isoformat()
        return frame

    def _available_times(self, start: datetime, end: datetime) -> tuple[list[datetime], datetime]:
        response = self._request(
            {
                "SERVICE": "WMS",
                "VERSION": "1.3.0",
                "REQUEST": "GetCapabilities",
                "LAYERS": "RDPS_10km_AirTemp_2m",
            }
        )
        try:
            root = ElementTree.fromstring(response.content)
        except ElementTree.ParseError as error:
            raise ValueError("ECCC capabilities response is not valid XML") from error
        layer = next(
            (
                candidate
                for candidate in root.iter()
                if _local_name(candidate.tag) == "Layer"
                and any(
                    _local_name(child.tag) == "Name" and child.text == "RDPS_10km_AirTemp_2m"
                    for child in candidate
                )
            ),
            None,
        )
        if layer is None:
            raise ValueError("ECCC capabilities are missing the RDPS temperature layer")
        dimensions = {
            dimension.attrib.get("name"): dimension
            for dimension in layer
            if _local_name(dimension.tag) == "Dimension"
        }
        time_dimension = dimensions.get("time")
        reference_dimension = dimensions.get("reference_time")
        if time_dimension is None or not time_dimension.text:
            raise ValueError("ECCC RDPS capabilities are missing the time dimension")
        interval = time_dimension.text.strip().split("/")
        if len(interval) != 3 or interval[2] != "PT1H":
            raise ValueError("ECCC RDPS time dimension must be an hourly ISO8601 interval")
        available_start = _eccc_time(interval[0])
        available_end = _eccc_time(interval[1])
        requested_start = _utc_datetime(start).replace(minute=0, second=0, microsecond=0)
        requested_end = _utc_datetime(end).replace(minute=0, second=0, microsecond=0)
        first = max(available_start, requested_start)
        last = min(available_end, requested_end)
        times = list(pd.date_range(first, last, freq="h", tz="UTC").to_pydatetime()) if first <= last else []
        reference_text = (
            reference_dimension.attrib.get("default")
            if reference_dimension is not None
            else None
        )
        reference_time = _eccc_time(reference_text or interval[0])
        return times, reference_time

    def _point_value(
        self,
        latitude: float,
        longitude: float,
        moment: datetime,
        layer: str,
    ) -> float | None:
        delta = 0.1
        response = self._request(
            {
                "SERVICE": "WMS",
                "VERSION": "1.1.1",
                "REQUEST": "GetFeatureInfo",
                "LAYERS": layer,
                "QUERY_LAYERS": layer,
                "STYLES": "",
                "SRS": "EPSG:4326",
                "BBOX": f"{longitude - delta},{latitude - delta},{longitude + delta},{latitude + delta}",
                "WIDTH": 101,
                "HEIGHT": 101,
                "X": 50,
                "Y": 50,
                "FORMAT": "image/png",
                "INFO_FORMAT": "application/json",
                "FEATURE_COUNT": 1,
                "TIME": moment.strftime("%Y-%m-%dT%H:%M:%SZ"),
            }
        )
        try:
            payload = response.json()
        except ValueError as error:
            raise ValueError(f"ECCC returned a non-JSON point response for {layer}") from error
        features = payload.get("features", [])
        if not features:
            return None
        value = features[0].get("properties", {}).get("value")
        return None if value is None else float(value)

    def _request(self, params: dict[str, object]) -> httpx.Response:
        last_error: Exception | None = None
        for attempt in range(self.retries):
            try:
                response = self.client.get(self.base_url, params=params, timeout=self.timeout)
                if response.status_code not in {429, 500, 502, 503, 504}:
                    response.raise_for_status()
                    return response
                last_error = httpx.HTTPStatusError(
                    f"ECCC GeoMet returned {response.status_code}",
                    request=response.request,
                    response=response,
                )
            except (httpx.TimeoutException, httpx.NetworkError) as error:
                last_error = error
            if attempt + 1 < self.retries:
                self.sleep(min(2**attempt, 4))
        assert last_error is not None
        raise last_error


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
    if provider == "eccc":
        return EcccRdpsForecastProvider(
            base_url=os.getenv("ECCC_BASE_URL", "https://geo.weather.gc.ca/geomet"),
            max_concurrency=int(os.getenv("ECCC_MAX_CONCURRENCY", "8")),
            user_agent=os.getenv(
                "ECCC_USER_AGENT",
                "BiteCast/0.1 (+https://github.com/TedTes/bitecast)",
            ),
        )
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


def _utc_datetime(value: datetime) -> datetime:
    return value.astimezone(UTC) if value.tzinfo else value.replace(tzinfo=UTC)


def _eccc_time(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC)


def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


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
