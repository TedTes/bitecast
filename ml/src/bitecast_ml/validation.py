from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from typing import Any

import pandas as pd
from pydantic import ValidationError

from .contracts import BroadTrainingRow, TrainingRow


@dataclass(frozen=True)
class ValidationIssue:
    row_number: int
    observation_id: str | None
    code: str
    detail: str


@dataclass
class ValidationReport:
    valid: pd.DataFrame
    rejected: pd.DataFrame
    issues: list[ValidationIssue]

    @property
    def summary(self) -> dict[str, Any]:
        return {
            "input_rows": len(self.valid) + len(self.rejected),
            "valid_rows": len(self.valid),
            "rejected_rows": len(self.rejected),
            "issues_by_code": dict(Counter(issue.code for issue in self.issues)),
        }

    @property
    def quality(self) -> dict[str, Any]:
        if self.valid.empty:
            return {"rows": 0}
        data = self.valid.copy()
        time_column = "hour_start" if "hour_start" in data else "period_start"
        times = pd.to_datetime(data[time_column], utc=True)
        result = {
            "rows": len(data),
            "catch_rows": int(data["caught"].astype(bool).sum()),
            "no_catch_rows": int((~data["caught"].astype(bool)).sum()),
            "lakes": {str(key): int(value) for key, value in data["lake_id"].value_counts().items()},
            "sources": {str(key): int(value) for key, value in data["source"].value_counts().items()},
            "seasons": {str(key): int(value) for key, value in data["season_mode"].value_counts().items()},
            "months": {
                str(key): int(value) for key, value in times.dt.month.value_counts().sort_index().items()
            },
            "positive_rate": float(data["caught"].astype(bool).mean()),
            "missing_fraction": {
                column: float(data[column].isna().mean())
                for column in data.columns
                if data[column].isna().any()
            },
        }
        if "anonymous_angler_id" in data:
            contributors = data["anonymous_angler_id"].dropna().value_counts()
            result["contributors"] = int(len(contributors))
            result["largest_contributor_fraction"] = (
                float(contributors.iloc[0] / len(data)) if len(contributors) else 0.0
            )
        return result


def validate_training_frame(frame: pd.DataFrame) -> ValidationReport:
    return _validate_frame(frame, TrainingRow, "training_consent")


def validate_broad_training_frame(frame: pd.DataFrame) -> ValidationReport:
    """Validate trip-level evidence separately from precise angler-hour observations."""
    return _validate_frame(frame, BroadTrainingRow, "training_authorized")


def _validate_frame(
    frame: pd.DataFrame,
    contract: type[TrainingRow] | type[BroadTrainingRow],
    authorization_field: str,
) -> ValidationReport:
    valid_rows: list[dict[str, Any]] = []
    rejected_rows: list[dict[str, Any]] = []
    issues: list[ValidationIssue] = []
    seen_observations: set[str] = set()

    for row_number, raw in enumerate(frame.to_dict(orient="records")):
        observation_id = str(raw.get("observation_id")) if raw.get("observation_id") else None
        if observation_id and observation_id in seen_observations:
            rejected_rows.append(raw)
            issues.append(
                ValidationIssue(row_number, observation_id, "duplicate", "duplicate observation_id")
            )
            continue
        try:
            parsed = contract.model_validate(_none_from_nan(raw))
            if not bool(getattr(parsed, authorization_field)):
                raise ValueError("observation is not authorized for training")
            seen_observations.add(parsed.observation_id)
            valid_rows.append(parsed.model_dump(mode="json"))
        except (ValidationError, ValueError) as error:
            rejected_rows.append(raw)
            issues.append(ValidationIssue(row_number, observation_id, "invalid_row", str(error)))

    return ValidationReport(pd.DataFrame(valid_rows), pd.DataFrame(rejected_rows), issues)


def _none_from_nan(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _none_from_nan(item) for key, item in value.items()}
    if isinstance(value, float) and pd.isna(value):
        return None
    return value
