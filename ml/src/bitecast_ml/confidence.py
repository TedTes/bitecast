from __future__ import annotations

import numpy as np
import pandas as pd

from .features import BASE_NUMERIC_FEATURES


def confidence_for_rows(
    raw_rows: pd.DataFrame,
    ensemble_predictions: np.ndarray,
    lake_counts: dict[str, int],
    known_categories: dict[str, list[str]],
) -> tuple[np.ndarray, list[str]]:
    missing = raw_rows.reindex(columns=BASE_NUMERIC_FEATURES).isna().mean(axis=1).to_numpy()
    disagreement = (
        ensemble_predictions.std(axis=0) if len(ensemble_predictions) > 1 else np.zeros(len(raw_rows))
    )
    counts = raw_rows["lake_id"].astype(str).map(lake_counts).fillna(0).to_numpy(dtype=float)
    coverage = np.clip(np.log1p(counts) / np.log1p(500), 0, 1)
    unknown_penalty = np.zeros(len(raw_rows))
    for column, values in known_categories.items():
        if column in raw_rows:
            unknown_penalty += (~raw_rows[column].astype(str).isin(values)).to_numpy() * 0.08
    score = 0.45 * coverage + 0.30 * (1 - missing) + 0.25 * np.clip(1 - disagreement / 0.15, 0, 1)
    score = np.clip(score - unknown_penalty, 0, 1)
    labels = ["High" if value >= 0.72 else "Medium" if value >= 0.45 else "Low" for value in score]
    return score, labels
