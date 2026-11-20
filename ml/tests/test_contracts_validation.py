from __future__ import annotations

import pandas as pd

from bitecast_ml.synthetic import generate_synthetic_training_data
from bitecast_ml.validation import validate_training_frame


def test_synthetic_rows_satisfy_contract() -> None:
    report = validate_training_frame(generate_synthetic_training_data(50))
    assert len(report.valid) == 50
    assert report.issues == []


def test_rejects_inconsistent_and_duplicate_rows() -> None:
    frame = generate_synthetic_training_data(3)
    frame.loc[0, "caught"] = False
    frame.loc[0, "catch_count"] = 2
    duplicate = frame.iloc[[1]].copy()
    report = validate_training_frame(pd.concat([frame, duplicate], ignore_index=True))
    assert len(report.valid) == 2
    assert len(report.rejected) == 2
    assert {issue.code for issue in report.issues} == {"invalid_row", "duplicate"}
