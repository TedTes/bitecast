from __future__ import annotations

import math
from datetime import UTC, datetime, timedelta

import numpy as np
import pandas as pd

LAKES = [
    ("lake-erie", "Great Lakes", 42.2, -81.2, "stained", 25700, 64),
    ("lake-ontario", "Great Lakes", 43.6, -77.9, "clear", 18960, 244),
    ("bay-of-quinte", "Eastern Ontario", 44.16, -77.18, "stained", 320, 30),
    ("lake-simcoe", "Central Ontario", 44.43, -79.37, "clear", 722, 41),
    ("lake-nipissing", "Northeastern Ontario", 46.25, -79.78, "stained", 873, 52),
]


def generate_synthetic_training_data(rows: int = 3000, seed: int = 4107) -> pd.DataFrame:
    """Generate a development fixture. It must never be presented as real model evidence."""
    rng = np.random.default_rng(seed)
    start = datetime(2024, 1, 1, tzinfo=UTC)
    output: list[dict] = []
    for index in range(rows):
        lake_id, region, latitude, longitude, clarity, area, max_depth = LAKES[index % len(LAKES)]
        moment = start + timedelta(hours=index * 5 + int(rng.integers(0, 4)))
        day = moment.timetuple().tm_yday
        season = "ice" if day < 80 or day > 345 else "open_water"
        sunrise_hour = 7.5 - 1.7 * math.cos(2 * math.pi * (day - 172) / 365.25)
        sunset_hour = 19.5 + 2.1 * math.cos(2 * math.pi * (day - 172) / 365.25)
        hour = moment.hour
        transition = math.exp(-min(abs(hour - sunrise_hour), abs(hour - sunset_hour)) / 1.8)
        cloud = float(rng.uniform(0, 100))
        wind = float(max(0, rng.normal(15, 8)))
        pressure_change = float(rng.normal(0, 3))
        seasonal_temp = 8 + 16 * math.sin(2 * math.pi * (day - 110) / 365.25)
        air_temp = float(seasonal_temp + rng.normal(0, 5))
        method = rng.choice(["jig", "troll", "tip-up", "cast"])
        logit = -2.3 + 1.4 * transition + 0.006 * cloud + 0.025 * min(wind, 25) - 0.015 * max(wind - 30, 0)
        logit += -0.03 * abs(pressure_change) + (
            0.35 if method in (["tip-up", "jig"] if season == "ice" else ["jig", "troll"]) else 0
        )
        probability = 1 / (1 + math.exp(-logit))
        caught = bool(rng.random() < probability)
        output.append(
            {
                "observation_id": f"synthetic-{index}",
                "trip_id": f"synthetic-trip-{index}",
                "anonymous_angler_id": f"synthetic-angler-{index % 120}",
                "lake_id": lake_id,
                "region": region,
                "latitude": latitude,
                "longitude": longitude,
                "hour_start": moment.isoformat(),
                "effort_minutes": int(rng.integers(30, 61)),
                "caught": caught,
                "catch_count": int(rng.integers(1, 5)) if caught else 0,
                "species": "walleye",
                "season_mode": season,
                "method": method,
                "bait_category": rng.choice(["minnow", "worm", "crankbait", "spoon"]),
                "fishing_depth_m": float(rng.uniform(2, 18)),
                "water_depth_m": float(rng.uniform(4, min(max_depth, 45))),
                "water_clarity": clarity,
                "air_temp_c": air_temp,
                "water_temp_c": float(max(0, air_temp * 0.65 + 5)),
                "wind_kmh": wind,
                "gust_kmh": wind + float(rng.uniform(0, 15)),
                "wind_direction_deg": float(rng.uniform(0, 360)),
                "cloud_pct": cloud,
                "precip_mm": float(max(0, rng.normal(0.5, 1.5))),
                "pressure_hpa": float(rng.normal(1013, 10)),
                "pressure_change_3h_hpa": pressure_change,
                "solar_elevation_deg": float(
                    35 * math.sin(math.pi * (hour - sunrise_hour) / max(1, sunset_hour - sunrise_hour))
                ),
                "minutes_from_sunrise": float((hour - sunrise_hour) * 60),
                "minutes_from_sunset": float((hour - sunset_hour) * 60),
                "moon_illumination": float((1 - math.cos(2 * math.pi * (day % 29.53) / 29.53)) / 2),
                "lake_area_km2": area,
                "lake_max_depth_m": max_depth,
                "source": "development-synthetic",
                "source_quality": 0.1,
                "training_consent": True,
            }
        )
    return pd.DataFrame(output)
