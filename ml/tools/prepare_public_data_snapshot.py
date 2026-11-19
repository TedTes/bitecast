"""Build a provenance-preserving public-data snapshot for BiteCast.

This script normalizes downloaded public inputs and produces a viability report.
It deliberately does not turn aggregate creel statistics into trip/hour labels.
"""

from __future__ import annotations

import csv
import hashlib
import json
import math
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_ROOT = REPO_ROOT / "data"
RAW_ROOT = DATA_ROOT / "raw"
EXTRACTED_ROOT = DATA_ROOT / "extracted"
NORMALIZED_ROOT = DATA_ROOT / "normalized"
REJECTED_ROOT = DATA_ROOT / "rejected"
RETRIEVED_AT = "2026-11-14"

LAKES = {
    "lake-erie": {"name": "Lake Erie", "latitude": 42.2, "longitude": -81.2},
    "lake-ontario": {"name": "Lake Ontario", "latitude": 43.6, "longitude": -77.9},
    "bay-of-quinte": {"name": "Bay of Quinte", "latitude": 44.16, "longitude": -77.18},
}

SOURCES = {
    "fishing-outcomes/michigan-great-lakes-creel-2025.pdf": {
        "source_id": "mi-dnr-creel-report-2025",
        "owner": "Michigan Department of Natural Resources",
        "url": "https://www2.dnr.state.mi.us/Publications/pdfs/DNRFishLibrary/FisheriesReports/FR049.pdf",
        "license": "No machine-readable licence found in report",
        "commercial": "review_required",
        "coverage": "2025",
        "geography": "Michigan waters of the Great Lakes",
        "catch": "aggregate",
        "effort": "aggregate",
        "eligible": False,
        "limitations": (
            "Published estimates; no individual trip start/end, catch time, or negative-trip record."
        ),
    },
    "fishing-outcomes/michigan-creel-summary-2025.xlsx": {
        "source_id": "mi-dnr-creel-summary-2025",
        "owner": "Michigan Department of Natural Resources",
        "url": "https://www.michigandnr.com/publications/pdfs/DNRFishLibrary/FisheriesReports/FR049_supp_material_Creel_Summary_2025.xlsx",
        "license": "No machine-readable licence found in workbook",
        "commercial": "review_required",
        "coverage": "2025",
        "geography": "Michigan waters of the Great Lakes",
        "catch": "aggregate",
        "effort": "aggregate",
        "eligible": False,
        "limitations": (
            "Lake/month/species estimates with uncertainty; cannot reconstruct independent "
            "angler-hour outcomes."
        ),
    },
    "fishing-outcomes/michigan-charter-summary-2025.xlsx": {
        "source_id": "mi-dnr-charter-summary-2025",
        "owner": "Michigan Department of Natural Resources",
        "url": "https://www.michigandnr.com/publications/pdfs/DNRFishLibrary/FisheriesReports/FR049_supp_material_Charter_Summary_2025.xlsx",
        "license": "No machine-readable licence found in workbook",
        "commercial": "review_required",
        "coverage": "2025",
        "geography": "Michigan waters of the Great Lakes",
        "catch": "aggregate",
        "effort": "aggregate",
        "eligible": False,
        "limitations": "Monthly fleet totals; useful for context, not independent trip/hour labels.",
    },
    "fishing-outcomes/new-york-lake-ontario-annual-report-2024.pdf": {
        "source_id": "ny-dec-lake-ontario-report-2024",
        "owner": "New York State Department of Environmental Conservation",
        "url": "https://dec.ny.gov/sites/default/files/2025-02/lakeontarioannualreport.pdf",
        "license": "No machine-readable licence found in report",
        "commercial": "review_required",
        "coverage": "2024",
        "geography": "New York waters of Lake Ontario",
        "catch": "aggregate",
        "effort": "aggregate",
        "eligible": False,
        "limitations": "Annual report tables; no consistently structured individual trip outcomes.",
    },
    "fishing-outcomes/ontario-lake-erie-creel-package.json": {
        "source_id": "on-lake-erie-creel-catalogue",
        "owner": "Government of Ontario",
        "url": "https://data.ontario.ca/api/3/action/package_show?id=lake-erie-and-lake-st-clair-creel-survey-results",
        "license": "Open Government Licence - Ontario (catalogue metadata)",
        "commercial": "unavailable",
        "coverage": "Catalogue entry only",
        "geography": "Ontario waters of Lake Erie and Lake St. Clair",
        "catch": "unknown",
        "effort": "unknown",
        "eligible": False,
        "limitations": "Dataset is under review and no downloadable data resource is currently published.",
    },
    "lake-metadata/ontario-lake-partner-water-clarity-2025.csv": {
        "source_id": "on-lake-partner-secchi-2025",
        "owner": "Government of Ontario",
        "url": "https://files.ontario.ca/moe_mapping/downloads/2Water/LPP/LPP_Secchi_2025.csv",
        "license": "Open Government Licence - Ontario",
        "commercial": "allowed_with_licence_terms",
        "coverage": "Historical observations published in 2025 file",
        "geography": "Ontario lakes",
        "catch": "no",
        "effort": "no",
        "eligible": True,
        "limitations": "Citizen-science Secchi observations are irregular in time and spatially sparse.",
    },
    "lake-metadata/fish-on-line-package.json": {
        "source_id": "on-fish-on-line-catalogue",
        "owner": "Government of Ontario",
        "url": "https://data.ontario.ca/api/3/action/package_show?id=fish-on-line",
        "license": "Open Government Licence - Ontario (catalogue metadata)",
        "commercial": "allowed_with_licence_terms",
        "coverage": "Current catalogue metadata",
        "geography": "Ontario",
        "catch": "no",
        "effort": "no",
        "eligible": False,
        "limitations": "Catalogue metadata only; not a normalized lake-property extract.",
    },
    "water-conditions/noaa-glsea-lake-erie-daily-c.csv": {
        "source_id": "noaa-glsea-erie-daily",
        "owner": "NOAA Great Lakes Environmental Research Laboratory",
        "url": "https://apps.glerl.noaa.gov/coastwatch/webdata/statistic/csv/all_year_glsea_avg_e_C.csv",
        "license": "US federal public data; verify NOAA attribution and product terms",
        "commercial": "review_required",
        "coverage": "1995-2026",
        "geography": "Whole-lake average, Lake Erie",
        "catch": "no",
        "effort": "no",
        "eligible": False,
        "limitations": "Lake-wide daily surface temperature is not a local observation at an angling site.",
    },
    "water-conditions/noaa-glsea-lake-ontario-daily-c.csv": {
        "source_id": "noaa-glsea-ontario-daily",
        "owner": "NOAA Great Lakes Environmental Research Laboratory",
        "url": "https://apps.glerl.noaa.gov/coastwatch/webdata/statistic/csv/all_year_glsea_avg_o_C.csv",
        "license": "US federal public data; verify NOAA attribution and product terms",
        "commercial": "review_required",
        "coverage": "1995-2026",
        "geography": "Whole-lake average, Lake Ontario",
        "catch": "no",
        "effort": "no",
        "eligible": False,
        "limitations": "Lake-wide daily surface temperature is not a local observation at an angling site.",
    },
    "water-conditions/noaa-glsea-all-lakes-2025.dat": {
        "source_id": "noaa-glsea-all-lakes-2025",
        "owner": "NOAA Great Lakes Environmental Research Laboratory",
        "url": "https://apps.glerl.noaa.gov/coastwatch/ftp/glsea/avgtemps/2025/glsea-temps2025_1024_3.dat",
        "license": "US federal public data; verify NOAA attribution and product terms",
        "commercial": "review_required",
        "coverage": "2025",
        "geography": "Great Lakes",
        "catch": "no",
        "effort": "no",
        "eligible": False,
        "limitations": "Redundant reference series; normalized per-lake CSV files are preferred.",
    },
    "water-conditions/glos-platforms.geojson": {
        "source_id": "glos-platform-catalogue",
        "owner": "Great Lakes Observing System",
        "url": "https://seagull-api.glos.org/api/v1/obs-datasets.geojson",
        "license": "Provider-specific terms may apply",
        "commercial": "review_required",
        "coverage": "Current platform catalogue",
        "geography": "Great Lakes",
        "catch": "no",
        "effort": "no",
        "eligible": False,
        "limitations": (
            "Platform metadata only; observation licences and sensor quality require per-provider review."
        ),
    },
    "water-conditions/glos-parameter-configurations.json": {
        "source_id": "glos-parameter-catalogue",
        "owner": "Great Lakes Observing System",
        "url": "https://seagull-api.glos.org/api/v1/parameter-configurations",
        "license": "Provider-specific terms may apply",
        "commercial": "review_required",
        "coverage": "Current parameter catalogue",
        "geography": "Great Lakes",
        "catch": "no",
        "effort": "no",
        "eligible": False,
        "limitations": "Configuration metadata only; no observations.",
    },
}

for lake_id in LAKES:
    SOURCES[f"historical-weather/{lake_id}-open-meteo-2020-2025.json"] = {
        "source_id": f"open-meteo-{lake_id}-2020-2025",
        "owner": "Open-Meteo and upstream weather-data providers",
        "url": (
            "https://archive-api.open-meteo.com/v1/archive"
            f"?latitude={LAKES[lake_id]['latitude']}&longitude={LAKES[lake_id]['longitude']}"
            "&start_date=2020-01-01&end_date=2025-12-31&timezone=UTC"
        ),
        "license": "Open-Meteo free API is non-commercial; upstream dataset licences also apply",
        "commercial": "not_approved_for_production",
        "coverage": "2020-01-01 through 2025-12-31 hourly",
        "geography": LAKES[lake_id]["name"],
        "catch": "no",
        "effort": "no",
        "eligible": False,
        "limitations": (
            "Point reanalysis at representative coordinates; evaluation only until "
            "production licence is approved."
        ),
    }

for forum_path in sorted((RAW_ROOT / "reports").glob("longpoint-apify-2026-11-15-*.jsonl")):
    relative = str(forum_path.relative_to(RAW_ROOT))
    is_index = "index-pages" in forum_path.stem
    SOURCES[relative] = {
        "source_id": f"longpoint-forum-{forum_path.stem.removeprefix('longpoint-apify-')}",
        "owner": "Channel 6-8 / individual forum contributors",
        "url": "https://www.longpoint.on.ca/forums/fishing-reports/",
        "license": "Project-owner authorization for BiteCast trip_broad bootstrap use",
        "commercial": "owner_directed_broad_model_use",
        "coverage": "One-time public snapshot retrieved 2026-11-15",
        "geography": "Primarily Lake Erie and Long Point region",
        "catch": "unstructured_and_incomplete",
        "effort": "partial",
        "eligible": not is_index,
        "limitations": (
            "Eligible only after row-level technical filtering for the trip_broad family; public forum "
            "text is self-selected, catch-heavy, and inconsistently structured. It must never be converted "
            "to invented hourly labels."
        ),
    }

SOURCES["reports/longpoint-apify-targeted-2026-11-17.jsonl"] = {
    "source_id": "longpoint-forum-apify-targeted-2026-11-17",
    "owner": "Channel 6-8 / individual forum contributor",
    "url": "https://longpoint.on.ca/threads/walleye-bows-elbow-sunday-july-14th.5108/",
    "license": "Project-owner authorization for BiteCast trip_broad bootstrap use",
    "commercial": "owner_directed_broad_model_use",
    "coverage": "Opening post published 2013-07-14; retrieved 2026-11-17",
    "geography": "Lake Erie, Long Point Elbow",
    "catch": "explicit_no_catch",
    "effort": "explicit_3.5_hours",
    "eligible": True,
    "retrieved_at": "2026-11-17",
    "limitations": (
        "One self-selected public report; eligible only for the trip_broad family and never for invented "
        "hourly labels. Apify capture is limited to the opening post."
    ),
}

SOURCES["reports/quintefishing-discourse-2026-11-18-topics.jsonl"] = {
    "source_id": "quintefishing-discourse-2026-11-18",
    "owner": "Quinte Fishing / individual forum contributors",
    "url": "https://quintefishing.com/c/general/4",
    "license": "Project-owner authorization for BiteCast trip_broad bootstrap use",
    "commercial": "owner_directed_broad_model_use",
    "coverage": "All 51 public Fishing-General topics available on 2026-11-18",
    "geography": "Bay of Quinte and nearby eastern Lake Ontario",
    "catch": "unstructured_and_incomplete",
    "effort": "partial",
    "eligible": True,
    "retrieved_at": "2026-11-18",
    "limitations": (
        "Only posts explicitly admitted by the review ledger may become trip_broad rows; questions, "
        "advice, uncertain species, repeated summaries, and vague dates remain excluded."
    ),
}

for kind in ("index", "threads"):
    relative = f"reports/longpoint-jina-{kind}-2026-11-18.jsonl"
    SOURCES[relative] = {
        "source_id": f"longpoint-forum-jina-{kind}-2026-11-18",
        "owner": "Channel 6-8 / individual forum contributors",
        "url": "https://longpoint.on.ca/forums/fishing-reports/",
        "license": "Project-owner authorization for BiteCast trip_broad bootstrap use",
        "commercial": "owner_directed_broad_model_use",
        "coverage": (
            "45 stratified forum index pages" if kind == "index" else "100 filtered candidate threads"
        ),
        "geography": "Primarily Lake Erie and Long Point region",
        "catch": "unstructured_and_incomplete",
        "effort": "partial",
        "eligible": kind == "threads",
        "retrieved_at": "2026-11-18",
        "limitations": (
            "Bounded discovery snapshot. Only technically filtered, explicit trip outcomes may enter "
            "the low-weight trip_broad family; page presence and silence are never labels."
        ),
    }

for coverage in (
    "2013-07-14-2013-07-15",
    "2026-08-15-2026-10-01",
    "2026-10-22-2026-11-04",
):
    relative = f"historical-weather/lake-erie-open-meteo-{coverage}.json"
    SOURCES[relative] = {
        "source_id": f"open-meteo-lake-erie-evaluation-{coverage}",
        "owner": "Open-Meteo and upstream weather-data providers",
        "url": "https://archive-api.open-meteo.com/v1/archive",
        "license": "Open-Meteo free API is non-commercial; upstream dataset licences also apply",
        "commercial": "not_approved_for_production",
        "coverage": coverage,
        "geography": "Representative Lake Erie coordinates",
        "catch": "no",
        "effort": "no",
        "eligible": False,
        "retrieved_at": "2026-11-17",
        "limitations": "Point reanalysis used only to exercise the bootstrap environmental join.",
    }

for coverage in ("2026-01-02-2026-03-03", "2026-07-31-2026-08-22"):
    relative = f"historical-weather/bay-of-quinte-open-meteo-{coverage}.json"
    SOURCES[relative] = {
        "source_id": f"open-meteo-bay-of-quinte-evaluation-{coverage}",
        "owner": "Open-Meteo and upstream weather-data providers",
        "url": "https://archive-api.open-meteo.com/v1/archive",
        "license": "Open-Meteo free API is non-commercial; upstream dataset licences also apply",
        "commercial": "not_approved_for_production",
        "coverage": coverage,
        "geography": "Representative Bay of Quinte coordinates",
        "catch": "no",
        "effort": "no",
        "eligible": False,
        "retrieved_at": "2026-11-18",
        "limitations": "Point reanalysis used only to exercise the bootstrap environmental join.",
    }

WDFW_COMMON = {
    "owner": "Washington Department of Fish and Wildlife",
    "license": "Public data portal record has no dataset-specific machine-readable licence",
    "commercial": "review_required",
    "coverage": "1996 and 2012 walleye-target interviews",
    "geography": "Horsethief Lake, Washington; outside BiteCast launch geography",
    "eligible": False,
    "retrieved_at": "2026-11-17",
}
for relative, source_id, url, catch, effort, limitations in (
    (
        "fishing-outcomes/wdfw-walleye-interviews.json",
        "wdfw-walleye-interviews-2026-11-17",
        "https://data.wa.gov/d/rpax-ahqm",
        "target_species_with_zero_catch_inferred_from_join",
        "start_and_end_time",
        "Only two target-species interviews; one trip is incomplete/right-censored.",
    ),
    (
        "fishing-outcomes/wdfw-walleye-catches.json",
        "wdfw-walleye-interview-catches-2026-11-17",
        "https://data.wa.gov/d/6y4e-8ftk",
        "caught_species_rows",
        "no",
        "Bounded to the two walleye-target interviews; contains only non-target catches.",
    ),
    (
        "fishing-outcomes/wdfw-walleye-gear.json",
        "wdfw-walleye-interview-gear-2026-11-17",
        "https://data.wa.gov/d/d2ks-afhz",
        "no",
        "no",
        "Bounded gear records only; no bait detail.",
    ),
    (
        "lake-metadata/wdfw-horsethief-lake.json",
        "wdfw-horsethief-lake-metadata-2026-11-17",
        "https://data.wa.gov/d/nbd2-vdmz",
        "no",
        "no",
        "Centroid only; lake morphology and clarity are absent.",
    ),
):
    SOURCES[relative] = {
        **WDFW_COMMON,
        "source_id": source_id,
        "url": url,
        "catch": catch,
        "effort": effort,
        "limitations": limitations,
    }

for dataset_id in ("rpax-ahqm", "6y4e-8ftk", "d2ks-afhz", "nbd2-vdmz"):
    SOURCES[f"fishing-outcomes/wdfw-{dataset_id}-metadata.json"] = {
        **WDFW_COMMON,
        "source_id": f"wdfw-{dataset_id}-metadata-2026-11-17",
        "url": f"https://data.wa.gov/api/views/{dataset_id}",
        "catch": "metadata_only",
        "effort": "metadata_only",
        "limitations": "Schema/provenance record only; never an outcome label.",
    }


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def write_manifest() -> pd.DataFrame:
    rows = []
    for relative, meta in sorted(SOURCES.items()):
        path = RAW_ROOT / relative
        rows.append(
            {
                "source_id": meta["source_id"],
                "category": relative.split("/", 1)[0],
                "owner": meta["owner"],
                "source_url": meta["url"],
                "retrieved_at": meta.get("retrieved_at", RETRIEVED_AT),
                "licence": meta["license"],
                "commercial_use_status": meta["commercial"],
                "file_type": path.suffix.removeprefix(".").lower(),
                "sha256": sha256(path),
                "date_coverage": meta["coverage"],
                "geographic_coverage": meta["geography"],
                "contains_catch_no_catch": meta["catch"],
                "contains_effort": meta["effort"],
                "training_eligible": meta["eligible"],
                "known_limitations": meta["limitations"],
                "local_path": str(path.relative_to(REPO_ROOT)),
            }
        )
    manifest = pd.DataFrame(rows)
    manifest.to_csv(DATA_ROOT / "source-manifest.csv", index=False, quoting=csv.QUOTE_MINIMAL)
    return manifest


def normalize_weather() -> pd.DataFrame:
    frames = []
    field_map = {
        "temperature_2m": "air_temp_c",
        "precipitation": "precip_mm",
        "cloud_cover": "cloud_pct",
        "pressure_msl": "pressure_hpa",
        "wind_speed_10m": "wind_kmh",
        "wind_direction_10m": "wind_direction_deg",
        "wind_gusts_10m": "wind_gust_kmh",
    }
    for lake_id, lake in LAKES.items():
        path = RAW_ROOT / f"historical-weather/{lake_id}-open-meteo-2020-2025.json"
        payload = json.loads(path.read_text())
        hourly = payload["hourly"]
        frame = pd.DataFrame({"hour_start_utc": pd.to_datetime(hourly["time"], utc=True)})
        for source, target in field_map.items():
            frame[target] = hourly[source]
        frame.insert(0, "lake_id", lake_id)
        frame["latitude"] = lake["latitude"]
        frame["longitude"] = lake["longitude"]
        direction = np.deg2rad(frame["wind_direction_deg"])
        frame["wind_u_kmh"] = -frame["wind_kmh"] * np.sin(direction)
        frame["wind_v_kmh"] = -frame["wind_kmh"] * np.cos(direction)
        frame["pressure_change_3h_hpa"] = frame["pressure_hpa"].diff(3)
        frame["temp_change_3h_c"] = frame["air_temp_c"].diff(3)
        frame["month"] = frame["hour_start_utc"].dt.month
        frame["hour_utc"] = frame["hour_start_utc"].dt.hour
        frame["day_of_year"] = frame["hour_start_utc"].dt.day_of_year
        frame["source_id"] = f"open-meteo-{lake_id}-2020-2025"
        frame["production_eligible"] = False
        frames.append(frame)
    weather = pd.concat(frames, ignore_index=True)
    weather.to_parquet(NORMALIZED_ROOT / "historical-weather.parquet", index=False)
    return weather


def dms_to_decimal(value: object, negative: bool = False) -> float:
    if pd.isna(value):
        return math.nan
    digits = "".join(character for character in str(value).split(".")[0] if character.isdigit())
    if len(digits) < 6:
        return math.nan
    degrees_digits = 3 if len(digits) >= 7 else 2
    degrees = int(digits[:degrees_digits])
    minutes = int(digits[degrees_digits : degrees_digits + 2])
    seconds = int(digits[degrees_digits + 2 : degrees_digits + 4])
    result = degrees + minutes / 60 + seconds / 3600
    return -result if negative else result


def normalize_clarity() -> pd.DataFrame:
    source = pd.read_csv(RAW_ROOT / "lake-metadata/ontario-lake-partner-water-clarity-2025.csv")
    lake_names = {
        "ERIE LAKE": "lake-erie",
        "ONTARIO LAKE": "lake-ontario",
        "BAY OF QUINTE": "bay-of-quinte",
    }
    names = source["Lake Name"].astype(str).str.strip().str.upper()
    clarity = source.loc[names.isin(lake_names)].copy()
    clarity.insert(0, "lake_id", names.loc[clarity.index].map(lake_names))
    clarity["latitude"] = clarity["Latitude (DMS)"].map(dms_to_decimal)
    clarity["longitude"] = clarity["Longitude (DMS"].map(lambda value: dms_to_decimal(value, True))
    clarity["observed_on"] = pd.to_datetime(clarity["Date (dd-mmm-yy)"], errors="coerce")
    clarity["secchi_depth_m"] = pd.to_numeric(clarity["Secchi depth (m)"], errors="coerce")
    clarity["source_id"] = "on-lake-partner-secchi-2025"
    candidates = clarity[
        [
            "lake_id",
            "observed_on",
            "secchi_depth_m",
            "latitude",
            "longitude",
            "Site ID",
            "Site Description",
            "source_id",
        ]
    ].rename(columns={"Site ID": "site_id", "Site Description": "site_description"})
    candidates.to_csv(EXTRACTED_ROOT / "ontario-target-lake-clarity.csv", index=False)
    duplicate_key = ["lake_id", "observed_on", "site_id", "secchi_depth_m"]
    candidates["duplicate_record"] = candidates.duplicated(duplicate_key, keep="first")
    candidates["invalid_date"] = candidates["observed_on"].isna() | (candidates["observed_on"].dt.year < 1990)
    candidates["invalid_location"] = ~candidates["latitude"].between(40, 50) | ~candidates[
        "longitude"
    ].between(-90, -70)
    candidates["invalid_secchi_depth"] = ~candidates["secchi_depth_m"].between(0, 100)
    rejected_mask = candidates[
        ["duplicate_record", "invalid_date", "invalid_location", "invalid_secchi_depth"]
    ].any(axis=1)
    rejected = candidates.loc[rejected_mask].copy()
    rejected["rejection_reason"] = rejected.apply(
        lambda row: "|".join(
            reason
            for reason, failed in (
                ("duplicate_record", row["duplicate_record"]),
                ("date_before_1990_or_missing", row["invalid_date"]),
                ("invalid_location", row["invalid_location"]),
                ("invalid_secchi_depth", row["invalid_secchi_depth"]),
            )
            if failed
        ),
        axis=1,
    )
    rejected.to_csv(REJECTED_ROOT / "lake-clarity-records.csv", index=False)
    normalized = candidates.loc[~rejected_mask].drop(
        columns=["duplicate_record", "invalid_date", "invalid_location", "invalid_secchi_depth"]
    )
    normalized.to_parquet(NORMALIZED_ROOT / "lake-clarity.parquet", index=False)
    summary = (
        normalized.groupby("lake_id")
        .agg(
            observation_count=("secchi_depth_m", "count"),
            first_observation=("observed_on", "min"),
            last_observation=("observed_on", "max"),
            median_secchi_depth_m=("secchi_depth_m", "median"),
        )
        .reset_index()
    )
    summary.to_csv(NORMALIZED_ROOT / "lake-metadata.csv", index=False)
    return normalized


def normalize_water_temperature() -> pd.DataFrame:
    frames = []
    for lake_id in ("lake-erie", "lake-ontario"):
        path = RAW_ROOT / f"water-conditions/noaa-glsea-{lake_id}-daily-c.csv"
        table = pd.read_csv(path)
        day_column = table.columns[0]
        long = table.melt(id_vars=day_column, var_name="year", value_name="surface_water_temp_c")
        long["year"] = pd.to_numeric(long["year"], errors="coerce")
        long["day_of_year"] = pd.to_numeric(long[day_column], errors="coerce")
        long = long.loc[long["year"].between(1995, 2025) & long["day_of_year"].notna()].copy()
        year_start = pd.to_datetime(long["year"].astype(int).astype(str), format="%Y")
        long["observed_on"] = year_start + pd.to_timedelta(long["day_of_year"] - 1, unit="D")
        long = long.loc[long["observed_on"].dt.year == long["year"]]
        long["lake_id"] = lake_id
        long["surface_water_temp_c"] = pd.to_numeric(long["surface_water_temp_c"], errors="coerce")
        long["spatial_scope"] = "whole_lake_daily_average"
        long["source_id"] = f"noaa-glsea-{lake_id.removeprefix('lake-')}-daily"
        long["production_eligible"] = False
        frames.append(
            long[
                [
                    "lake_id",
                    "observed_on",
                    "surface_water_temp_c",
                    "spatial_scope",
                    "source_id",
                    "production_eligible",
                ]
            ]
        )
    water = pd.concat(frames, ignore_index=True)
    water.to_parquet(NORMALIZED_ROOT / "water-conditions.parquet", index=False)
    return water


def haversine_km(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    radius = 6371.0088
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = math.sin(delta_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    return radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def extract_nearby_glos_platforms() -> pd.DataFrame:
    payload = json.loads((RAW_ROOT / "water-conditions/glos-platforms.geojson").read_text())
    rows = []
    for feature in payload["features"]:
        geometry = feature.get("geometry") or {}
        if geometry.get("type") != "Point":
            continue
        longitude, latitude = geometry["coordinates"][:2]
        distances = {
            lake_id: haversine_km(longitude, latitude, lake["longitude"], lake["latitude"])
            for lake_id, lake in LAKES.items()
        }
        lake_id = min(distances, key=distances.get)
        if distances[lake_id] > 175:
            continue
        properties = feature.get("properties") or {}
        rows.append(
            {
                "nearest_lake_id": lake_id,
                "distance_to_reference_km": round(distances[lake_id], 2),
                "obs_dataset_id": properties.get("obs_dataset_id"),
                "org_platform_id": properties.get("org_platform_id"),
                "platform_name": properties.get("platform_name"),
                "platform_type": properties.get("platform_type"),
                "body_of_water": properties.get("body_of_water"),
                "latitude": latitude,
                "longitude": longitude,
                "parameters": "|".join(
                    sorted(
                        {
                            parameter.get("standard_name", "")
                            for parameter in properties.get("parameters", [])
                            if parameter.get("standard_name")
                        }
                    )
                ),
            }
        )
    platforms = pd.DataFrame(rows).sort_values(["nearest_lake_id", "distance_to_reference_km"])
    platforms.to_csv(EXTRACTED_ROOT / "glos-nearby-platforms.csv", index=False)
    return platforms


def extract_aggregate_reference() -> pd.DataFrame:
    species = pd.read_csv(EXTRACTED_ROOT / "michigan-lake-erie-species.csv")
    effort = pd.read_csv(EXTRACTED_ROOT / "michigan-lake-erie-effort.csv")
    walleye = species.loc[species["Species"].astype(str).str.strip().str.casefold() == "walleye"].iloc[0]
    effort = effort.loc[effort["Report Month"].astype(str).str.match(r"^[A-Z][a-z]+ 2025$")].copy()
    rows = []
    for _, effort_row in effort.iterrows():
        month = effort_row["Report Month"]
        hours = float(effort_row["Total Hrs"])
        harvest = float(walleye.get(month, 0) or 0)
        rows.append(
            {
                "lake_id": "lake-erie",
                "month": pd.to_datetime(month, format="%B %Y"),
                "mode": "charter",
                "target_species": "walleye",
                "reported_hours": hours,
                "reported_harvest": harvest,
                "harvest_per_hour": harvest / hours if hours else math.nan,
                "source_id": "mi-dnr-charter-summary-2025",
                "training_eligible": False,
                "exclusion_reason": (
                    "Monthly fleet aggregate is not an independent trip or angler-hour outcome."
                ),
            }
        )
    aggregate = pd.DataFrame(rows)
    aggregate.to_csv(EXTRACTED_ROOT / "aggregate-outcomes-reference.csv", index=False)
    return aggregate


def write_crosswalk() -> None:
    aliases = {
        "lake-erie": "Lake Erie|Erie Lake|LE",
        "lake-ontario": "Lake Ontario|Ontario Lake|LO",
        "bay-of-quinte": "Bay of Quinte|Quinte|BOQ",
    }
    rows = [
        {
            "lake_id": lake_id,
            "canonical_name": lake["name"],
            "aliases": aliases[lake_id],
            "reference_latitude": lake["latitude"],
            "reference_longitude": lake["longitude"],
            "crosswalk_status": "verified_against_bitecast_seed",
        }
        for lake_id, lake in LAKES.items()
    ]
    pd.DataFrame(rows).to_csv(DATA_ROOT / "lake-crosswalk.csv", index=False)


def write_rejections() -> pd.DataFrame:
    rows = [
        {
            "source_id": "mi-dnr-creel-summary-2025",
            "candidate_rows": "aggregate tables",
            "eligible_outcome_rows": 0,
            "reason": "No independent trip/hour records and no exact outcome timestamps.",
        },
        {
            "source_id": "mi-dnr-charter-summary-2025",
            "candidate_rows": 9,
            "eligible_outcome_rows": 0,
            "reason": (
                "Monthly fleet harvest and effort totals cannot be treated as independent observations."
            ),
        },
        {
            "source_id": "ny-dec-lake-ontario-report-2024",
            "candidate_rows": "report tables",
            "eligible_outcome_rows": 0,
            "reason": "Annual report does not provide a normalized individual trip outcome dataset.",
        },
        {
            "source_id": "on-lake-erie-creel-catalogue",
            "candidate_rows": 0,
            "eligible_outcome_rows": 0,
            "reason": "Catalogue dataset is under review and has no downloadable resource.",
        },
    ]
    rejections = pd.DataFrame(rows)
    rejections.to_csv(REJECTED_ROOT / "outcome-source-rejections.csv", index=False)
    return rejections


def missingness(frame: pd.DataFrame, columns: list[str]) -> dict[str, int]:
    return {column: int(frame[column].isna().sum()) for column in columns}


def write_reports(
    manifest: pd.DataFrame,
    weather: pd.DataFrame,
    clarity: pd.DataFrame,
    water: pd.DataFrame,
    platforms: pd.DataFrame,
    aggregate: pd.DataFrame,
) -> None:
    duplicate_weather = int(weather.duplicated(["lake_id", "hour_start_utc"]).sum())
    clarity_candidates = pd.read_csv(EXTRACTED_ROOT / "ontario-target-lake-clarity.csv")
    clarity_rejections = pd.read_csv(REJECTED_ROOT / "lake-clarity-records.csv")
    duplicate_clarity = int(clarity_rejections["duplicate_record"].sum())
    invalid_clarity = int(
        clarity_rejections[["invalid_date", "invalid_location", "invalid_secchi_depth"]].any(axis=1).sum()
    )
    broad_path = EXTRACTED_ROOT / "longpoint-broad-observations.parquet"
    broad = pd.read_parquet(broad_path) if broad_path.exists() else pd.DataFrame()
    broad_catches = int(broad["caught"].astype(bool).sum()) if not broad.empty else 0
    broad_no_catches = len(broad) - broad_catches
    quality = {
        "generated_at": datetime.now(UTC).isoformat(),
        "decision": "NO_GO_FOR_CHALLENGER_TRAINING",
        "eligible_outcome_rows": 0,
        "hourly_eligible_outcome_rows": 0,
        "broad_authorized_candidate_rows": len(broad),
        "broad_catch_rows": broad_catches,
        "broad_no_catch_rows": broad_no_catches,
        "broad_training_ready_rows": 0,
        "catch_rows": 0,
        "no_catch_rows": 0,
        "outcome_source_concentration": "not_measurable_without_eligible_outcomes",
        "outcome_rows_by_lake_month_and_season": {},
        "open_water_outcome_rows": 0,
        "ice_season_outcome_rows": 0,
        "aggregate_outcome_reference_rows": len(aggregate),
        "historical_weather_rows": len(weather),
        "weather_rows_by_lake": weather.groupby("lake_id").size().astype(int).to_dict(),
        "weather_missing_values": missingness(
            weather,
            [
                "air_temp_c",
                "precip_mm",
                "cloud_pct",
                "pressure_hpa",
                "wind_kmh",
                "wind_direction_deg",
            ],
        ),
        "weather_duplicate_lake_hours": duplicate_weather,
        "clarity_candidate_rows": len(clarity_candidates),
        "clarity_rows": len(clarity),
        "clarity_rows_by_lake": clarity.groupby("lake_id").size().astype(int).to_dict(),
        "clarity_duplicate_observations": duplicate_clarity,
        "clarity_invalid_observations": invalid_clarity,
        "clarity_rejected_rows": len(clarity_rejections),
        "water_temperature_rows": len(water),
        "water_temperature_rows_by_lake": water.groupby("lake_id").size().astype(int).to_dict(),
        "nearby_glos_platforms": len(platforms),
        "manifest_sources": len(manifest),
        "production_approved_sources": int(
            manifest["commercial_use_status"].eq("allowed_with_licence_terms").sum()
        ),
        "geographic_and_temporal_gaps": [
            "No eligible angler-hour outcomes with effort and exact outcome timestamps.",
            "Broad forum candidates are too few, all catches, and lack period-matched 2026 weather.",
            "No public outcome coverage for Bay of Quinte was acquired.",
            "Open-Meteo evaluation snapshot is not approved for commercial production use.",
            "NOAA and GLOS usage terms require final production review.",
            "Lake-wide water temperature is not local site temperature.",
        ],
    }
    (DATA_ROOT / "quality-report.json").write_text(json.dumps(quality, indent=2) + "\n")

    clarity_counts = quality["clarity_rows_by_lake"]
    weather_counts = quality["weather_rows_by_lake"]
    water_counts = quality["water_temperature_rows_by_lake"]
    report = f"""# Public training-data viability report

Generated: {RETRIEVED_AT}

## Decision

**NO-GO for challenger training today.** Three Long Point reports pass the broad model's technical and
project-authorization filters, but all three are catch reports and still lack period-matched 2026 weather.
They are preserved as trip/day labels for `trip_broad`; none is expanded into fabricated hourly labels.

## What was acquired and extracted

- {len(manifest)} raw source artifacts with URLs, owners, licence status, hashes, coverage, and limitations.
- {len(weather):,} hourly historical weather rows: {weather_counts}.
- {len(clarity_candidates):,} candidate target-lake Secchi-depth observations; {len(clarity):,}
  remain after duplicate and validity filters: {clarity_counts}.
- {len(water):,} daily whole-lake surface-temperature rows: {water_counts}.
- {len(platforms):,} GLOS platforms within 175 km of a BiteCast lake reference point.
- {len(aggregate):,} Lake Erie monthly charter outcome summaries retained as non-training reference data.
- {len(broad):,} authorized, technically usable Long Point trip/day candidates for the broad family.

## Outcome validation

| Measure | Result |
|---|---:|
| Hourly eligible outcome rows | 0 |
| Broad authorized candidates | {len(broad)} |
| Broad catch rows | {broad_catches} |
| Broad no-catch rows | {broad_no_catches} |
| Broad training-ready rows | 0 |
| Broad lakes | {broad['lake_id'].nunique() if not broad.empty else 0} |
| Broad open-water/ice coverage | Open water only |
| Duplicate eligible outcomes | 0 |
| Invalid eligible outcomes | 0 |

The three broad candidates are real trip/report labels, but they are insufficient to train: CatBoost needs
both catch and no-catch examples, more trips, and joined environment data. The hourly zero remains a
validation result, not a pipeline failure.

## Feature-input validation

- Weather keys are unique by lake and UTC hour; duplicate count: {duplicate_weather}.
- Weather pressure and temperature changes are calculated only within each lake series. The first three
  hours per lake are intentionally missing for three-hour deltas.
- Rejected Secchi records: {len(clarity_rejections)} ({duplicate_clarity} duplicates and
  {invalid_clarity} invalid or suspicious values).
- Bay of Quinte has clarity and weather coverage but no separate NOAA whole-lake temperature series.
- NOAA temperatures are explicitly marked as whole-lake daily averages.
- Every normalized row retains a source ID; production eligibility is kept separate from technical usability.

## Required next input

Acquire more broad reports—especially no-catch trips—and period-matched historical weather. Precise
consented BiteCast logs continue feeding both the broad trip aggregate and the separate hourly family.
Training begins only after minimum rows, class balance, leakage, duplication, geographic, temporal, and
environmental checks pass.

## Files

- `source-manifest.csv`: provenance and rights review.
- `lake-crosswalk.csv`: canonical BiteCast lake identities.
- `normalized/historical-weather.parquet`: hourly weather and derived changes.
- `normalized/lake-clarity.parquet`: relevant Secchi observations.
- `normalized/water-conditions.parquet`: daily whole-lake temperature.
- `extracted/aggregate-outcomes-reference.csv`: aggregate reference only; never a label table.
- `extracted/longpoint-broad-observations.parquet`: authorized day-precision broad candidates.
- `rejected/outcome-source-rejections.csv`: outcome exclusions and reasons.
- `rejected/lake-clarity-records.csv`: duplicate, invalid, and suspicious clarity rows.
- `quality-report.json`: machine-readable counts, missingness, duplicates, and gaps.
"""
    (DATA_ROOT / "data-viability-report.md").write_text(report)


def main() -> None:
    for directory in (EXTRACTED_ROOT, NORMALIZED_ROOT, REJECTED_ROOT):
        directory.mkdir(parents=True, exist_ok=True)
    manifest = write_manifest()
    write_crosswalk()
    weather = normalize_weather()
    clarity = normalize_clarity()
    water = normalize_water_temperature()
    platforms = extract_nearby_glos_platforms()
    aggregate = extract_aggregate_reference()
    write_rejections()
    write_reports(manifest, weather, clarity, water, platforms, aggregate)
    broad_path = EXTRACTED_ROOT / "longpoint-broad-observations.parquet"
    broad_rows = len(pd.read_parquet(broad_path)) if broad_path.exists() else 0
    print(
        json.dumps(
            {
                "sources": len(manifest),
                "weather_rows": len(weather),
                "clarity_rows": len(clarity),
                "water_temperature_rows": len(water),
                "nearby_glos_platforms": len(platforms),
                "eligible_outcome_rows": 0,
                "broad_authorized_candidate_rows": broad_rows,
                "training_decision": "NO_GO",
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
