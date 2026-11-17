from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import pandas as pd

from .contracts import FEATURE_CONTRACT_VERSION


@dataclass(frozen=True)
class TrainingSnapshot:
    dataset_hash: str
    directory: Path
    data_path: Path
    manifest_path: Path
    lineage_path: Path
    row_count: int


def create_training_snapshot(
    frame: pd.DataFrame,
    output_root: Path,
    feature_contract_version: str = FEATURE_CONTRACT_VERSION,
    model_family: str = "hourly",
) -> TrainingSnapshot:
    """Write a content-addressed dataset and exact consent lineage without overwriting prior snapshots."""
    if frame.empty:
        raise ValueError("cannot snapshot an empty training dataset")
    if frame["observation_id"].duplicated().any():
        raise ValueError("training snapshots require unique observation_id values")

    ordered = frame.sort_values("observation_id").reset_index(drop=True)
    canonical = ordered.to_json(orient="records", date_format="iso", date_unit="us", double_precision=12)
    dataset_hash = hashlib.sha256(canonical.encode()).hexdigest()
    directory = output_root / dataset_hash
    data_path = directory / "training.parquet"
    manifest_path = directory / "manifest.json"
    lineage_path = directory / "user-log-lineage.parquet"
    directory.mkdir(parents=True, exist_ok=True)

    if manifest_path.exists():
        existing = json.loads(manifest_path.read_text())
        if existing.get("dataset_hash") != dataset_hash or existing.get("row_count") != len(ordered):
            raise ValueError("existing snapshot manifest does not match its content-addressed path")
    else:
        ordered.to_parquet(data_path, index=False)
        lineage_columns = [
            "observation_id",
            "trip_id",
            "anonymous_angler_id",
            "source_log_updated_at",
            "consent_policy_version",
            "consent_updated_at",
        ]
        available = [column for column in lineage_columns if column in ordered]
        user_sources = {"bitecast-user-log", "bitecast-user-trip-aggregate"}
        lineage = ordered.loc[ordered.get("source", "").isin(user_sources), available]
        lineage.to_parquet(lineage_path, index=False)
        manifest = {
            "dataset_hash": dataset_hash,
            "feature_contract_version": feature_contract_version,
            "model_family": model_family,
            "row_count": len(ordered),
            "user_log_rows": int(ordered.get("source", "").isin(user_sources).sum()),
            "sources": {str(key): int(value) for key, value in ordered["source"].value_counts().items()},
            "seasons": {str(key): int(value) for key, value in ordered["season_mode"].value_counts().items()},
            "created_at": datetime.now(UTC).isoformat(),
            "data_file": data_path.name,
            "lineage_file": lineage_path.name,
        }
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")

    return TrainingSnapshot(
        dataset_hash,
        directory,
        data_path,
        manifest_path,
        lineage_path,
        len(ordered),
    )
