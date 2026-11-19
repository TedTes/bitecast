"""Extract and assess the bounded WDFW walleye-target creel snapshot."""

from __future__ import annotations

import csv
import json
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[2]
RAW_OUTCOMES = REPO_ROOT / "data/raw/fishing-outcomes"
RAW_LAKES = REPO_ROOT / "data/raw/lake-metadata"
EXTRACTED_ROOT = REPO_ROOT / "data/extracted"
REJECTED_ROOT = REPO_ROOT / "data/rejected"
TIMEZONE = ZoneInfo("America/Los_Angeles")


def _load(path: Path) -> list[dict]:
    return json.loads(path.read_text())


def _duration_minutes(day: str, start: str, end: str) -> tuple[datetime, datetime, int]:
    started = datetime.fromisoformat(f"{day[:10]}T{start}").replace(tzinfo=TIMEZONE)
    ended = datetime.fromisoformat(f"{day[:10]}T{end}").replace(tzinfo=TIMEZONE)
    if ended <= started:
        ended = ended + pd.Timedelta(days=1)
    return started, ended, round((ended - started).total_seconds() / 60)


def extract() -> tuple[pd.DataFrame, pd.DataFrame, dict]:
    interviews = _load(RAW_OUTCOMES / "wdfw-walleye-interviews.json")
    catches = _load(RAW_OUTCOMES / "wdfw-walleye-catches.json")
    gear = _load(RAW_OUTCOMES / "wdfw-walleye-gear.json")
    lakes = _load(RAW_LAKES / "wdfw-horsethief-lake.json")
    lake = lakes[0]
    catches_by_interview: dict[str, list[dict]] = {}
    for row in catches:
        catches_by_interview.setdefault(row["interview_id"], []).append(row)
    gear_by_interview = {row["interview_id"]: row for row in gear}

    extracted: list[dict] = []
    rejected: list[dict] = []
    for interview in interviews:
        started, ended, effort = _duration_minutes(
            interview["event_date"],
            interview["fishing_start_time"],
            interview["fishing_end_time"],
        )
        target_catches = [
            row
            for row in catches_by_interview.get(interview["interview_id"], [])
            if str(row.get("species", "")).casefold() == "walleye"
        ]
        catch_count = sum(int(row.get("fish_count") or 0) for row in target_catches)
        status = str(interview.get("trip_status") or "unknown").casefold()
        reasons = ["geographic_transfer_only", "commercial_reuse_review_required"]
        if status != "complete":
            reasons.append("incomplete_trip_is_right_censored")
        source_gear = gear_by_interview.get(interview["interview_id"], {})
        extracted.append(
            {
                "record_id": interview["interview_id"],
                "source_id": "wdfw-creel-walleye-target-snapshot-2026-11-17",
                "source_url": "https://data.wa.gov/d/rpax-ahqm",
                "report_date": interview["event_date"][:10],
                "period_start": started.isoformat(),
                "period_end": ended.isoformat(),
                "effort_minutes": effort,
                "angler_count": int(interview["angler_count"]),
                "trip_status": interview["trip_status"],
                "lake_id": "us-wa-horsethief-lake",
                "water_body": interview["water_body"],
                "latitude": float(lake["centroid_lat"]),
                "longitude": float(lake["centroid_lon"]),
                "species": "walleye",
                "caught": catch_count > 0,
                "catch_count": catch_count,
                "angling_gear": source_gear.get("angling_gear"),
                "other_species_caught": "|".join(
                    sorted(
                        {
                            str(row["species"])
                            for row in catches_by_interview.get(interview["interview_id"], [])
                            if str(row.get("species", "")).casefold() != "walleye"
                        }
                    )
                ),
                "broad_transfer_candidate": status == "complete",
                "training_eligible": False,
                "exclusion_reasons": "|".join(reasons),
            }
        )
        rejected.append(
            {
                "record_id": interview["interview_id"],
                "source_url": "https://data.wa.gov/d/rpax-ahqm",
                "reasons": "|".join(reasons),
                "excluded_from_training": True,
            }
        )

    frame = pd.DataFrame(extracted)
    rejected_frame = pd.DataFrame(rejected)
    quality = {
        "snapshot_date": "2026-11-17",
        "target_species_interviews": len(frame),
        "complete_trips": int(frame["trip_status"].str.casefold().eq("complete").sum()),
        "incomplete_trips": int(frame["trip_status"].str.casefold().ne("complete").sum()),
        "walleye_catch_rows": int(frame["caught"].sum()),
        "walleye_no_catch_rows": int((~frame["caught"]).sum()),
        "known_effort_rows": int(frame["effort_minutes"].notna().sum()),
        "broad_transfer_candidates": int(frame["broad_transfer_candidate"].sum()),
        "training_eligible_rows": int(frame["training_eligible"].sum()),
        "decision": "reference_only_pending_reuse_review_and_transfer-family_design",
    }
    return frame, rejected_frame, quality


def main() -> None:
    EXTRACTED_ROOT.mkdir(parents=True, exist_ok=True)
    REJECTED_ROOT.mkdir(parents=True, exist_ok=True)
    frame, rejected, quality = extract()
    frame.to_csv(EXTRACTED_ROOT / "wdfw-walleye-interviews.csv", index=False, quoting=csv.QUOTE_MINIMAL)
    rejected.to_csv(REJECTED_ROOT / "wdfw-walleye-interviews.csv", index=False)
    (REPO_ROOT / "data/wdfw-walleye-quality-report.json").write_text(
        json.dumps(quality, indent=2) + "\n"
    )
    print(json.dumps(quality, indent=2))


if __name__ == "__main__":
    main()
