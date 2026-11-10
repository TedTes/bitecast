from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime
from pathlib import Path

import httpx
import pandas as pd


class HistoricalWeatherProvider(ABC):
    @abstractmethod
    def hourly(self, latitude: float, longitude: float, start: datetime, end: datetime) -> pd.DataFrame:
        """Return UTC rows containing hour_start and weather feature columns."""


class FileWeatherProvider(HistoricalWeatherProvider):
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
