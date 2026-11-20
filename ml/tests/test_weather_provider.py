from __future__ import annotations

from datetime import UTC, datetime

import httpx
import pytest

from bitecast_ml.weather import (
    EcccRdpsForecastProvider,
    OpenMeteoForecastProvider,
)

ECCC_CAPABILITIES = (
    b'<?xml version="1.0" encoding="UTF-8"?>'
    b'<WMS_Capabilities xmlns="http://www.opengis.net/wms">'
    b'<Capability><Layer><Layer queryable="1">'
    b'<Name>RDPS_10km_AirTemp_2m</Name>'
    b'<Dimension name="time" units="ISO8601" default="2026-11-16T15:00:00Z">'
    b"2026-11-16T12:00:00Z/2026-11-16T15:00:00Z/PT1H</Dimension>"
    b'<Dimension name="reference_time" units="ISO8601" default="2026-11-16T06:00:00Z">'
    b"2026-11-16T06:00:00Z</Dimension>"
    b"</Layer></Layer></Capability></WMS_Capabilities>"
)


ECCC_VALUES = {
    "RDPS_10km_AirTemp_2m": 5.0,
    "RDPS_10km_Precip-Accum1h": 0.2,
    "RDPS_10km_Pressure_MSL": 101000.0,
    "RDPS_10km_TotalCloudCover": 30.0,
    "RDPS_10km_WindSpeed_10m": 5.0,
    "RDPS_10km_WindDir_10m": 180.0,
    "RDPS_10km_WindGust_10m": 8.0,
}


def _eccc_response(request: httpx.Request) -> httpx.Response:
    if request.url.params.get("REQUEST") == "GetCapabilities":
        return httpx.Response(200, request=request, content=ECCC_CAPABILITIES)
    layer = request.url.params["LAYERS"]
    hour = int(request.url.params["TIME"][11:13])
    return httpx.Response(
        200,
        request=request,
        json={
            "features": [
                {
                    "properties": {
                        "value": ECCC_VALUES[layer] + (hour - 12),
                        "time": request.url.params["TIME"],
                    }
                }
            ]
        },
    )


def test_eccc_maps_anonymous_rdps_forecast_contract() -> None:
    provider = EcccRdpsForecastProvider(
        client=httpx.Client(transport=httpx.MockTransport(_eccc_response)),
        max_concurrency=2,
    )
    frame = provider.hourly(
        42.2,
        -81.2,
        datetime(2026, 11, 16, 12, tzinfo=UTC),
        datetime(2026, 11, 16, 15, tzinfo=UTC),
    )

    assert len(frame) == 4
    assert frame.iloc[0]["air_temp_c"] == 5.0
    assert frame.iloc[0]["pressure_hpa"] == 1010.0
    assert frame.iloc[0]["wind_kmh"] == 18.0
    assert frame.iloc[0]["gust_kmh"] == 28.8
    assert frame.iloc[-1]["pressure_change_3h_hpa"] == pytest.approx(0.03)
    assert set(frame["source"]) == {"eccc-rdps-10km"}
    assert set(frame["source_reference_time"]) == {"2026-11-16T06:00:00+00:00"}


def test_eccc_retries_transient_failures() -> None:
    attempts = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        if request.url.params.get("REQUEST") == "GetCapabilities":
            attempts += 1
            if attempts < 3:
                return httpx.Response(503, request=request)
        return _eccc_response(request)

    provider = EcccRdpsForecastProvider(
        client=httpx.Client(transport=httpx.MockTransport(handler)),
        max_concurrency=1,
        sleep=lambda _: None,
    )
    provider.hourly(
        42.2,
        -81.2,
        datetime(2026, 11, 16, 12, tzinfo=UTC),
        datetime(2026, 11, 16, 12, 1, tzinfo=UTC),
    )
    assert attempts == 3


def test_eccc_rejects_missing_core_weather() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.params.get("REQUEST") == "GetCapabilities":
            return httpx.Response(200, request=request, content=ECCC_CAPABILITIES)
        return httpx.Response(200, request=request, json={"features": []})

    provider = EcccRdpsForecastProvider(
        client=httpx.Client(transport=httpx.MockTransport(handler)),
        max_concurrency=2,
    )
    with pytest.raises(ValueError, match="complete core weather"):
        provider.hourly(
            42.2,
            -81.2,
            datetime(2026, 11, 16, 12, tzinfo=UTC),
            datetime(2026, 11, 16, 13, tzinfo=UTC),
        )


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
