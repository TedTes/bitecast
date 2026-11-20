from __future__ import annotations

import math

import numpy as np
import pandas as pd
from sklearn.metrics import brier_score_loss, log_loss, roc_auc_score


def expected_calibration_error(labels: np.ndarray, probabilities: np.ndarray, bins: int = 10) -> float:
    edges = np.linspace(0, 1, bins + 1)
    error = 0.0
    for lower, upper in zip(edges[:-1], edges[1:], strict=True):
        mask = (probabilities >= lower) & (
            (probabilities <= upper) if upper == 1 else (probabilities < upper)
        )
        if mask.any():
            error += mask.mean() * abs(probabilities[mask].mean() - labels[mask].mean())
    return float(error)


def top_fraction_lift(labels: np.ndarray, probabilities: np.ndarray, fraction: float = 0.20) -> float:
    baseline = labels.mean()
    if baseline <= 0:
        return 0.0
    count = max(1, math.ceil(len(labels) * fraction))
    return float(labels[np.argsort(probabilities)[-count:]].mean() / baseline)


def classification_metrics(labels: np.ndarray, probabilities: np.ndarray) -> dict[str, float | int | None]:
    labels = np.asarray(labels, dtype=int)
    probabilities = np.clip(np.asarray(probabilities, dtype=float), 1e-7, 1 - 1e-7)
    auc = float(roc_auc_score(labels, probabilities)) if len(np.unique(labels)) == 2 else None
    return {
        "rows": int(len(labels)),
        "positive_rate": float(labels.mean()),
        "log_loss": float(log_loss(labels, probabilities, labels=[0, 1])),
        "brier": float(brier_score_loss(labels, probabilities)),
        "roc_auc": auc,
        "ece": expected_calibration_error(labels, probabilities),
        "top_20_lift": top_fraction_lift(labels, probabilities),
    }


def segmented_metrics(frame: pd.DataFrame, probabilities: np.ndarray, column: str) -> dict[str, dict]:
    enriched = frame.copy()
    enriched["_probability"] = probabilities
    return {
        str(value): classification_metrics(
            group["caught"].astype(int).to_numpy(), group["_probability"].to_numpy()
        )
        for value, group in enriched.groupby(column, dropna=False)
        if len(group) >= 10
    }
