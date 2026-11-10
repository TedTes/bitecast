from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

from .supabase_rest import SupabaseRest


def publish_challenger(db: SupabaseRest, artifact_dir: Path, artifact_uri: str) -> dict:
    metadata = json.loads((artifact_dir / "metadata.json").read_text())
    metrics = json.loads((artifact_dir / "metrics.json").read_text())
    row = {
        "version": metadata["version"],
        "season_mode": metadata["season_mode"],
        "status": "challenger",
        "artifact_uri": artifact_uri,
        "dataset_hash": metadata["dataset_hash"],
        "feature_contract_version": metadata["feature_contract_version"],
        "metrics": metrics,
        "created_at": metadata["created_at"],
    }
    db.upsert("model_versions", [row], "version")
    return row


def promote_remote(db: SupabaseRest, version: str, season: str) -> None:
    db.update(
        "model_versions", {"status": "archived"}, {"season_mode": f"eq.{season}", "status": "eq.champion"}
    )
    db.update(
        "model_versions",
        {"status": "champion", "promoted_at": datetime.now(UTC).isoformat()},
        {"version": f"eq.{version}", "season_mode": f"eq.{season}"},
    )
