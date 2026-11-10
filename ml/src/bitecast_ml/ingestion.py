from __future__ import annotations

import hashlib
import json
import shutil
from dataclasses import dataclass
from datetime import timedelta
from pathlib import Path

import pandas as pd

from .source_registry import SourceRegistry


@dataclass(frozen=True)
class IngestionResult:
    normalized_path: Path
    raw_copy_path: Path
    manifest_path: Path
    row_count: int
    sha256: str


def ingest_canonical_file(
    input_path: Path,
    output_root: Path,
    source_id: str,
    registry: SourceRegistry,
) -> IngestionResult:
    source = registry.require_eligible(source_id)
    digest = hashlib.sha256(input_path.read_bytes()).hexdigest()
    raw_dir = output_root / "raw" / source_id
    normalized_dir = output_root / "normalized" / source_id
    raw_dir.mkdir(parents=True, exist_ok=True)
    normalized_dir.mkdir(parents=True, exist_ok=True)
    raw_copy = raw_dir / f"{digest[:16]}{input_path.suffix}"
    if not raw_copy.exists():
        shutil.copy2(input_path, raw_copy)
    frame = _read_frame(input_path)
    frame["source"] = source_id
    frame["source_quality"] = source.quality_weight
    normalized = normalized_dir / f"{digest[:16]}.parquet"
    frame.to_parquet(normalized, index=False)
    manifest = normalized.with_suffix(".manifest.json")
    manifest.write_text(
        json.dumps(
            {
                "source_id": source_id,
                "sha256": digest,
                "row_count": len(frame),
                "input_name": input_path.name,
                "license": source.license,
            },
            indent=2,
        )
        + "\n"
    )
    return IngestionResult(normalized, raw_copy, manifest, len(frame), digest)


def expand_trip_to_angler_hours(trip: dict) -> list[dict]:
    """Expand a consented trip into effort-normalized rows without inventing catches."""
    start = pd.Timestamp(trip["trip_started_at"])
    end = pd.Timestamp(trip["trip_ended_at"])
    if start.tzinfo is None or end.tzinfo is None or end <= start:
        raise ValueError("trip timestamps must be timezone-aware and end after start")
    caught_at = pd.Timestamp(trip["caught_at"]) if trip.get("caught") and trip.get("caught_at") else None
    rows: list[dict] = []
    cursor = start.floor("h")
    while cursor < end:
        segment_start = max(start, cursor)
        segment_end = min(end, cursor + timedelta(hours=1))
        effort = max(1, round((segment_end - segment_start).total_seconds() / 60))
        positive = bool(caught_at is not None and segment_start <= caught_at < segment_end)
        rows.append(
            {
                **trip,
                "observation_id": f"{trip['trip_id']}:{cursor.isoformat()}",
                "hour_start": cursor.isoformat(),
                "effort_minutes": effort,
                "caught": positive,
                "catch_count": int(trip.get("catch_count", 0)) if positive else 0,
            }
        )
        cursor += timedelta(hours=1)
    return rows


def _read_frame(path: Path) -> pd.DataFrame:
    return pd.read_parquet(path) if path.suffix == ".parquet" else pd.read_csv(path)
