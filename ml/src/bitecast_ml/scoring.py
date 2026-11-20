from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta

import numpy as np
import pandas as pd


def percentile_score(probability: float, reference: list[float]) -> int:
    if not reference:
        return 50
    values = np.asarray(sorted(reference), dtype=float)
    percentile = np.searchsorted(values, probability, side="right") / len(values)
    return int(np.clip(round(percentile * 100), 0, 100))


@dataclass(frozen=True)
class ForecastWindow:
    start: pd.Timestamp
    end: pd.Timestamp
    peak_score: int
    peak_probability: float


def forecast_windows(
    hours: pd.DataFrame, minimum_score: int = 65, maximum_gap_hours: int = 1
) -> list[ForecastWindow]:
    selected = hours[hours["bite_score"] >= minimum_score].sort_values("hour_start")
    if selected.empty:
        return []
    windows: list[ForecastWindow] = []
    group: list[pd.Series] = []
    for _, row in selected.iterrows():
        if group and pd.Timestamp(row["hour_start"]) - pd.Timestamp(group[-1]["hour_start"]) > timedelta(
            hours=maximum_gap_hours
        ):
            windows.append(_to_window(group))
            group = []
        group.append(row)
    if group:
        windows.append(_to_window(group))
    return windows


def _to_window(rows: list[pd.Series]) -> ForecastWindow:
    peak = max(rows, key=lambda row: int(row["bite_score"]))
    return ForecastWindow(
        start=pd.Timestamp(rows[0]["hour_start"]),
        end=pd.Timestamp(rows[-1]["hour_start"]) + timedelta(hours=1),
        peak_score=int(peak["bite_score"]),
        peak_probability=float(peak["raw_probability"]),
    )
