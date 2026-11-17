from __future__ import annotations

from datetime import UTC, datetime

import httpx
import pytest

from bitecast_ml.weather import OpenMeteoForecastProvider


def _payload() -> dict:
    return {
        "hourly": {
            "time": ["2026-11-16T12:00", "2026-11-16T13:00", "2026-11-16T14:00", "2026-11-16T15:00"],
            "temperature_2m": [5.0, 6.0, 7.0, 8.0],
            "precipitation": [0.0, 0.2, 0.0, 0.0],
            "pressure_msl": [1010.0, 1011.0, 1012.0, 1014.0],
            "cloud_cover": [20, 30, 40, 50],
            "wind_speed_10m": [10.0, 11.0, 12.0, 13.0],
            "wind_direction_10m": [180, 190, 200, 210],
            "wind_gusts_10m": [15.0, 16.0, 17.0, 18.0],
        }
    }


def test_open_meteo_maps_commercial_forecast_contract() -> None:
    seen: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        return httpx.Response(200, request=request, json=_payload())

    client = httpx.Client(transport=httpx.MockTransport(handler))
    provider = OpenMeteoForecastProvider(
        "https://customer-api.open-meteo.com",
        "secret-key",
        client=client,
    )
    frame = provider.hourly(
        42.2,
        -81.2,
        datetime(2026, 11, 16, 12, tzinfo=UTC),
        datetime(2026, 11, 16, 15, tzinfo=UTC),
    )

    assert len(frame) == 4
    assert frame.iloc[-1]["pressure_change_3h_hpa"] == 4.0
    assert frame.iloc[0]["air_temp_c"] == 5.0
    assert set(frame["source"]) == {"open-meteo-commercial"}
    assert "apikey=secret-key" in seen["url"]
    assert "timezone=UTC" in seen["url"]


def test_open_meteo_retries_transient_failures() -> None:
    attempts = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        if attempts < 3:
            return httpx.Response(503, request=request)
        return httpx.Response(200, request=request, json=_payload())

    provider = OpenMeteoForecastProvider(
        "https://customer-api.open-meteo.com",
        "secret-key",
        client=httpx.Client(transport=httpx.MockTransport(handler)),
        sleep=lambda _: None,
    )
    provider.hourly(
        42.2,
        -81.2,
        datetime(2026, 11, 16, 12, tzinfo=UTC),
        datetime(2026, 11, 16, 15, tzinfo=UTC),
    )
    assert attempts == 3


def test_open_meteo_rejects_incomplete_hourly_payload() -> None:
    payload = _payload()
    del payload["hourly"]["cloud_cover"]
    client = httpx.Client(
        transport=httpx.MockTransport(lambda request: httpx.Response(200, request=request, json=payload))
    )
    provider = OpenMeteoForecastProvider(
        "https://customer-api.open-meteo.com",
        "secret-key",
        client=client,
    )
    with pytest.raises(ValueError, match="cloud_cover"):
        provider.hourly(
            42.2,
            -81.2,
            datetime(2026, 11, 16, 12, tzinfo=UTC),
            datetime(2026, 11, 16, 15, tzinfo=UTC),
        )
