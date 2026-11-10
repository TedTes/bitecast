from __future__ import annotations

from dataclasses import dataclass

import pandas as pd


@dataclass(frozen=True)
class DatasetSplits:
    train: pd.DataFrame
    validation: pd.DataFrame
    test: pd.DataFrame
    lake_holdout: pd.DataFrame
    held_out_lakes: tuple[str, ...]


def leakage_safe_split(
    frame: pd.DataFrame,
    train_fraction: float = 0.70,
    validation_fraction: float = 0.15,
    lake_holdout_fraction: float = 0.20,
) -> DatasetSplits:
    if not 0 < train_fraction < 1 or not 0 < validation_fraction < 1:
        raise ValueError("split fractions must be between zero and one")
    if train_fraction + validation_fraction >= 1:
        raise ValueError("train and validation fractions must leave a test period")
    data = frame.copy()
    data["hour_start"] = pd.to_datetime(data["hour_start"], utc=True)
    lakes = sorted(data["lake_id"].astype(str).unique())
    holdout_count = max(1, round(len(lakes) * lake_holdout_fraction)) if len(lakes) >= 3 else 0
    held_out_lakes = tuple(lakes[-holdout_count:]) if holdout_count else ()
    lake_holdout = data[data["lake_id"].isin(held_out_lakes)].copy()
    development = data[~data["lake_id"].isin(held_out_lakes)].copy()
    if development.empty:
        raise ValueError("lake holdout removed every training row")
    trip_times = development.groupby("trip_id", as_index=False)["hour_start"].min().sort_values("hour_start")
    train_index = max(1, int(len(trip_times) * train_fraction))
    validation_index = max(train_index + 1, int(len(trip_times) * (train_fraction + validation_fraction)))
    train_trips = set(trip_times.iloc[:train_index]["trip_id"])
    validation_trips = set(trip_times.iloc[train_index:validation_index]["trip_id"])
    test_trips = set(trip_times.iloc[validation_index:]["trip_id"])
    if not validation_trips or not test_trips:
        raise ValueError("at least seven distinct trips are required for leakage-safe splitting")
    return DatasetSplits(
        train=development[development["trip_id"].isin(train_trips)].copy(),
        validation=development[development["trip_id"].isin(validation_trips)].copy(),
        test=development[development["trip_id"].isin(test_trips)].copy(),
        lake_holdout=lake_holdout,
        held_out_lakes=held_out_lakes,
    )
