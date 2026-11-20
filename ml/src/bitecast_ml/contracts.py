from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

FEATURE_CONTRACT_VERSION = "angler-hour-v2"
BROAD_FEATURE_CONTRACT_VERSION = "trip-time-block-v1"


class SeasonMode(StrEnum):
    OPEN_WATER = "open_water"
    ICE = "ice"


class Clarity(StrEnum):
    CLEAR = "clear"
    STAINED = "stained"
    MURKY = "murky"
    UNKNOWN = "unknown"


class Method(StrEnum):
    JIG = "jig"
    TROLL = "troll"
    TIP_UP = "tip-up"
    CAST = "cast"
    OTHER = "other"


class TimePrecision(StrEnum):
    EXACT = "exact"
    TIME_BLOCK = "time_block"
    DAY = "day"
    UNKNOWN = "unknown"


Probability = Annotated[float, Field(ge=0, le=1)]


class TrainingRow(BaseModel):
    """Canonical angler-hour used by every importer and training run."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    observation_id: str = Field(min_length=1)
    trip_id: str = Field(min_length=1)
    anonymous_angler_id: str | None = None
    lake_id: str = Field(min_length=1)
    region: str = "unknown"
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    hour_start: datetime
    effort_minutes: int = Field(gt=0, le=60)
    caught: bool
    catch_count: int = Field(ge=0, le=100)
    species: str = "walleye"
    season_mode: SeasonMode
    method: Method = Method.OTHER
    bait_category: str = "unknown"
    fishing_depth_m: float | None = Field(default=None, ge=0, le=100)
    water_depth_m: float | None = Field(default=None, ge=0, le=300)
    water_clarity: Clarity = Clarity.UNKNOWN
    secchi_depth_m: float | None = Field(default=None, gt=0, le=100)
    air_temp_c: float | None = Field(default=None, ge=-60, le=60)
    water_temp_c: float | None = Field(default=None, ge=-5, le=40)
    wind_kmh: float | None = Field(default=None, ge=0, le=250)
    gust_kmh: float | None = Field(default=None, ge=0, le=350)
    wind_direction_deg: float | None = Field(default=None, ge=0, le=360)
    cloud_pct: float | None = Field(default=None, ge=0, le=100)
    precip_mm: float | None = Field(default=None, ge=0, le=500)
    pressure_hpa: float | None = Field(default=None, ge=850, le=1100)
    pressure_change_3h_hpa: float | None = Field(default=None, ge=-100, le=100)
    solar_elevation_deg: float | None = Field(default=None, ge=-90, le=90)
    minutes_from_sunrise: float | None = Field(default=None, ge=-1440, le=1440)
    minutes_from_sunset: float | None = Field(default=None, ge=-1440, le=1440)
    moon_illumination: Probability | None = None
    lake_area_km2: float | None = Field(default=None, gt=0)
    lake_max_depth_m: float | None = Field(default=None, gt=0)
    source: str = Field(min_length=1)
    source_quality: Probability = 1.0
    training_consent: bool = True
    consent_policy_version: str | None = None
    consent_updated_at: datetime | None = None
    source_log_updated_at: datetime | None = None

    @field_validator("hour_start")
    @classmethod
    def require_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("hour_start must include a timezone")
        return value

    @field_validator("species")
    @classmethod
    def require_walleye(cls, value: str) -> str:
        if value.lower() != "walleye":
            raise ValueError("the v1 custom model accepts walleye observations only")
        return "walleye"

    @model_validator(mode="after")
    def outcome_is_consistent(self) -> TrainingRow:
        if self.caught and self.catch_count < 1:
            raise ValueError("caught observations require catch_count >= 1")
        if not self.caught and self.catch_count != 0:
            raise ValueError("no-catch observations require catch_count = 0")
        if self.source == "bitecast-user-log":
            if not self.anonymous_angler_id:
                raise ValueError("user logs require a pseudonymous angler ID")
            if not self.consent_policy_version or not self.consent_updated_at:
                raise ValueError("user logs require versioned consent metadata")
            required_environment = (self.air_temp_c, self.wind_kmh, self.cloud_pct, self.pressure_hpa)
            if any(value is None for value in required_environment):
                raise ValueError("user logs require joined temperature, wind, cloud, and pressure")
        return self


class BroadTrainingRow(BaseModel):
    """Trip-level evidence used by the broad bootstrap model without inventing hourly labels."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    observation_id: str = Field(min_length=1)
    trip_id: str = Field(min_length=1)
    anonymous_angler_id: str | None = None
    lake_id: str = Field(min_length=1)
    region: str = "unknown"
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    period_start: datetime
    period_end: datetime
    time_precision: TimePrecision
    time_block: str = "day"
    label_granularity: Literal["trip"] = "trip"
    effort_minutes: int | None = Field(default=None, gt=0, le=10080)
    effort_known: bool = False
    caught: bool
    catch_count: int | None = Field(default=None, ge=0, le=100)
    species: str = "walleye"
    season_mode: SeasonMode
    method: Method = Method.OTHER
    bait_category: str = "unknown"
    fishing_depth_m: float | None = Field(default=None, ge=0, le=100)
    water_depth_m: float | None = Field(default=None, ge=0, le=300)
    water_clarity: Clarity = Clarity.UNKNOWN
    secchi_depth_m: float | None = Field(default=None, gt=0, le=100)
    air_temp_c: float | None = Field(default=None, ge=-60, le=60)
    air_temp_range_c: float | None = Field(default=None, ge=0, le=120)
    water_temp_c: float | None = Field(default=None, ge=-5, le=40)
    wind_kmh: float | None = Field(default=None, ge=0, le=250)
    wind_range_kmh: float | None = Field(default=None, ge=0, le=250)
    gust_kmh: float | None = Field(default=None, ge=0, le=350)
    wind_direction_deg: float | None = Field(default=None, ge=0, le=360)
    cloud_pct: float | None = Field(default=None, ge=0, le=100)
    precip_mm: float | None = Field(default=None, ge=0, le=5000)
    pressure_hpa: float | None = Field(default=None, ge=850, le=1100)
    pressure_range_hpa: float | None = Field(default=None, ge=0, le=250)
    pressure_change_3h_hpa: float | None = Field(default=None, ge=-100, le=100)
    solar_elevation_deg: float | None = Field(default=None, ge=-90, le=90)
    minutes_from_sunrise: float | None = Field(default=None, ge=-1440, le=1440)
    minutes_from_sunset: float | None = Field(default=None, ge=-1440, le=1440)
    moon_illumination: Probability | None = None
    lake_area_km2: float | None = Field(default=None, gt=0)
    lake_max_depth_m: float | None = Field(default=None, gt=0)
    source: str = Field(min_length=1)
    source_url: str | None = None
    source_quality: Probability = 0.25
    training_authorized: bool = True

    @field_validator("period_start", "period_end")
    @classmethod
    def require_broad_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("broad periods must include a timezone")
        return value

    @field_validator("species")
    @classmethod
    def require_broad_walleye(cls, value: str) -> str:
        if value.lower() != "walleye":
            raise ValueError("the broad v1 model accepts walleye observations only")
        return "walleye"

    @model_validator(mode="after")
    def broad_outcome_is_consistent(self) -> BroadTrainingRow:
        if self.period_end <= self.period_start:
            raise ValueError("period_end must be after period_start")
        if not self.training_authorized:
            raise ValueError("observation is not authorized for training")
        if self.effort_known != (self.effort_minutes is not None):
            raise ValueError("effort_known must match whether effort_minutes is present")
        if self.caught and self.catch_count == 0:
            raise ValueError("caught observations cannot have catch_count = 0")
        if not self.caught and self.catch_count not in (None, 0):
            raise ValueError("no-catch observations require catch_count = 0 or unknown")
        return self


class ForecastInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    lake_id: str
    region: str = "unknown"
    latitude: float
    longitude: float
    hour_start: datetime
    season_mode: SeasonMode
    method: Method = Method.OTHER
    bait_category: str = "unknown"
    fishing_depth_m: float | None = None
    water_depth_m: float | None = None
    water_clarity: Clarity = Clarity.UNKNOWN
    secchi_depth_m: float | None = None
    air_temp_c: float | None = None
    water_temp_c: float | None = None
    wind_kmh: float | None = None
    gust_kmh: float | None = None
    wind_direction_deg: float | None = None
    cloud_pct: float | None = None
    precip_mm: float | None = None
    pressure_hpa: float | None = None
    pressure_change_3h_hpa: float | None = None
    solar_elevation_deg: float | None = None
    minutes_from_sunrise: float | None = None
    minutes_from_sunset: float | None = None
    moon_illumination: float | None = None
    lake_area_km2: float | None = None
    lake_max_depth_m: float | None = None


class ForecastOutput(BaseModel):
    lake_id: str
    hour_start: datetime
    season_mode: SeasonMode
    bite_score: int = Field(ge=0, le=100)
    raw_probability: Probability
    confidence: str
    confidence_score: Probability
    reasons: list[str]
    model_version: str
    forecast_available: bool = True
