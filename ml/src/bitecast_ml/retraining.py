from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path

import pandas as pd

from .registry import ModelRegistry
from .training import TrainingConfig, train_model


@dataclass(frozen=True)
class RetrainingDecision:
    should_train: bool
    current_rows: int
    previous_rows: int
    new_rows: int
    reason: str


def should_retrain(frame: pd.DataFrame, state_path: Path, minimum_new_rows: int) -> RetrainingDecision:
    previous = json.loads(state_path.read_text()).get("row_count", 0) if state_path.exists() else 0
    current = len(frame)
    new = max(0, current - previous)
    reason = (
        "threshold met" if new >= minimum_new_rows else f"need {minimum_new_rows - new} more validated rows"
    )
    return RetrainingDecision(new >= minimum_new_rows, current, previous, new, reason)


def scheduled_retrain(
    frame: pd.DataFrame,
    artifact_root: Path,
    registry: ModelRegistry,
    state_path: Path,
    minimum_new_rows: int = 1000,
    auto_promote: bool = False,
) -> dict:
    decision = should_retrain(frame, state_path, minimum_new_rows)
    report: dict = {"decision": asdict(decision), "trained": []}
    if not decision.should_train:
        return report
    for season in ("open_water", "ice"):
        season_rows = frame[frame["season_mode"].astype(str) == season]
        if len(season_rows) < 200:
            report["trained"].append({"season": season, "skipped": "fewer than 200 rows"})
            continue
        result = train_model(frame, artifact_root, TrainingConfig(season_mode=season))
        registry.register(result.artifact_dir)
        if auto_promote:
            registry.promote(result.version)
        report["trained"].append({"season": season, "version": result.version, "metrics": result.metrics})
    state_path.parent.mkdir(parents=True, exist_ok=True)
    state_path.write_text(
        json.dumps({"row_count": len(frame), "completed_at": datetime.now(UTC).isoformat()}, indent=2) + "\n"
    )
    return report
