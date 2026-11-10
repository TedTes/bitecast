from __future__ import annotations

import math
from datetime import datetime
from zoneinfo import ZoneInfo

from astral import LocationInfo
from astral.moon import phase
from astral.sun import elevation, sun


def astronomy_features(
    moment: datetime, latitude: float, longitude: float, timezone: str
) -> dict[str, float]:
    zone = ZoneInfo(timezone)
    local = moment.astimezone(zone)
    location = LocationInfo("lake", "BiteCast", timezone, latitude, longitude)
    solar = sun(location.observer, date=local.date(), tzinfo=zone)
    lunar_phase = phase(local.date()) / 28.0
    illumination = (1 - math.cos(2 * math.pi * lunar_phase)) / 2
    return {
        "solar_elevation_deg": float(elevation(location.observer, local)),
        "minutes_from_sunrise": (local - solar["sunrise"]).total_seconds() / 60,
        "minutes_from_sunset": (local - solar["sunset"]).total_seconds() / 60,
        "moon_illumination": float(max(0, min(1, illumination))),
    }
