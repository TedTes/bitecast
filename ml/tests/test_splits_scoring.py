from __future__ import annotations

import pandas as pd

from bitecast_ml.scoring import forecast_windows, percentile_score
from bitecast_ml.splits import leakage_safe_split
from bitecast_ml.synthetic import generate_synthetic_training_data


def test_split_never_leaks_trips_or_holdout_lakes() -> None:
    splits = leakage_safe_split(generate_synthetic_training_data(300))
    assert set(splits.train.trip_id).isdisjoint(splits.validation.trip_id)
    assert set(splits.train.trip_id).isdisjoint(splits.test.trip_id)
    assert set(splits.train.lake_id).isdisjoint(splits.held_out_lakes)
    assert set(splits.lake_holdout.lake_id) == set(splits.held_out_lakes)


def test_percentiles_and_contiguous_windows() -> None:
    assert percentile_score(0.3, [0.1, 0.2, 0.3, 0.4]) == 75
    frame = pd.DataFrame(
        {
            "hour_start": pd.to_datetime(["2026-06-01T10:00Z", "2026-06-01T11:00Z", "2026-06-01T14:00Z"]),
            "bite_score": [70, 82, 90],
            "raw_probability": [0.3, 0.5, 0.6],
        }
    )
    windows = forecast_windows(frame)
    assert len(windows) == 2
    assert windows[0].peak_score == 82
    assert windows[1].peak_score == 90
