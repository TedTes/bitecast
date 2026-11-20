from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import pandas as pd
from catboost import CatBoostClassifier, Pool
from sklearn.isotonic import IsotonicRegression

from .broad import (
    BROAD_CATEGORICAL_FEATURES,
    BROAD_FEATURE_COLUMNS,
    broad_training_weights,
    make_broad_feature_frame,
)
from .contracts import BROAD_FEATURE_CONTRACT_VERSION
from .evaluation import classification_metrics, segmented_metrics
from .splits import DatasetSplits, leakage_safe_split


@dataclass(frozen=True)
class BroadTrainingConfig:
    season_mode: str
    iterations: int = 500
    depth: int = 7
    learning_rate: float = 0.04
    ensemble_size: int = 3
    minimum_rows: int = 100
    minimum_positive_rows: int = 20
    random_seed: int = 5107
    canary_only: bool = False


@dataclass(frozen=True)
class BroadTrainingResult:
    version: str
    artifact_dir: Path
    metrics: dict


def train_broad_model(
    frame: pd.DataFrame, output_root: Path, config: BroadTrainingConfig
) -> BroadTrainingResult:
    data = frame[frame["season_mode"].astype(str) == config.season_mode].copy()
    if len(data) < config.minimum_rows:
        raise ValueError(
            f"Need at least {config.minimum_rows} broad {config.season_mode} rows; received {len(data)}"
        )
    positive_rows = int(data["caught"].astype(bool).sum())
    if positive_rows < config.minimum_positive_rows or positive_rows >= len(data):
        raise ValueError("Broad training requires sufficient positive and negative outcomes")
    version = _version(config.season_mode, data)
    artifact_dir = output_root / version
    models_dir = artifact_dir / "models"
    models_dir.mkdir(parents=True, exist_ok=False)

    splits = None if config.canary_only else leakage_safe_split(data, time_column="period_start")
    training_frame = data if splits is None else splits.train
    train_pool = _pool(training_frame, with_label=True)
    validation_pool = None if splits is None else _pool(splits.validation, with_label=True)
    models: list[CatBoostClassifier] = []
    for offset in range(config.ensemble_size):
        model = CatBoostClassifier(
            iterations=config.iterations,
            depth=config.depth,
            learning_rate=config.learning_rate,
            loss_function="Logloss",
            eval_metric="Logloss",
            random_seed=config.random_seed + offset,
            allow_writing_files=False,
            verbose=False,
            l2_leaf_reg=5,
            random_strength=0.5,
        )
        if validation_pool is None:
            model.fit(train_pool)
        else:
            model.fit(
                train_pool,
                eval_set=validation_pool,
                use_best_model=True,
                early_stopping_rounds=60,
            )
        model.save_model(models_dir / f"seed-{config.random_seed + offset}.cbm")
        models.append(model)

    if splits is None:
        calibrator = _fit_identity_calibrator()
    else:
        raw_validation = _ensemble_predict(models, splits.validation)
        calibrator = _fit_calibrator(splits.validation["caught"].astype(int).to_numpy(), raw_validation)
    calibration = {"x": calibrator.X_thresholds_.tolist(), "y": calibrator.y_thresholds_.tolist()}
    (artifact_dir / "calibration.json").write_text(json.dumps(calibration, indent=2) + "\n")

    if splits is None:
        train_probabilities = calibrator.predict(_ensemble_predict(models, training_frame))
        metrics = {
            "canary_only": True,
            "evaluation_protocol": "training-fit-diagnostic-only-no-holdout",
            "training_fit": classification_metrics(
                training_frame["caught"].astype(int).to_numpy(), train_probabilities
            ),
            "limitations": [
                "Insufficient rows for leakage-safe validation",
                "Metrics are in-sample and must not be presented as model accuracy",
                "Artifact is ineligible for production champion promotion",
            ],
        }
    else:
        metrics = _evaluate_all(models, calibrator, splits)
        train_probabilities = calibrator.predict(_ensemble_predict(models, training_frame))
    references = _score_references(training_frame, train_probabilities)
    (artifact_dir / "score_references.json").write_text(json.dumps(references, indent=2) + "\n")

    metadata = {
        "version": version,
        "created_at": datetime.now(UTC).isoformat(),
        "model_family": "trip_broad",
        "prediction_granularity": "time_block",
        "season_mode": config.season_mode,
        "feature_contract_version": BROAD_FEATURE_CONTRACT_VERSION,
        "dataset_hash": _dataset_hash(data),
        "training_rows": len(training_frame),
        "validation_rows": 0 if splits is None else len(splits.validation),
        "test_rows": 0 if splits is None else len(splits.test),
        "lake_holdout_rows": 0 if splits is None else len(splits.lake_holdout),
        "held_out_lakes": [] if splits is None else list(splits.held_out_lakes),
        "feature_columns": BROAD_FEATURE_COLUMNS,
        "categorical_features": BROAD_CATEGORICAL_FEATURES,
        "lake_counts": {
            str(key): int(value) for key, value in training_frame["lake_id"].value_counts().items()
        },
        "known_categories": {
            column: sorted(
                training_frame[column].fillna("unknown").astype(str).str.lower().unique().tolist()
            )
            for column in BROAD_CATEGORICAL_FEATURES
        },
        "time_precision_counts": {
            str(key): int(value)
            for key, value in training_frame["time_precision"].value_counts().items()
        },
        "minimum_confidence": 0.0 if config.canary_only else 0.25,
        "canary_only": config.canary_only,
        "deployment_stage": "early_access" if config.canary_only else "production_candidate",
        "score_cap": 69 if config.canary_only else 100,
        "score_basis": (
            "forecast_horizon_relative_percentile"
            if config.canary_only
            else "historical_reference_percentile"
        ),
        "confidence_cap": 0.44 if config.canary_only else 1.0,
        "config": asdict(config),
    }
    (artifact_dir / "metadata.json").write_text(json.dumps(metadata, indent=2) + "\n")
    (artifact_dir / "metrics.json").write_text(json.dumps(metrics, indent=2) + "\n")
    return BroadTrainingResult(version, artifact_dir, metrics)


def _pool(frame: pd.DataFrame, with_label: bool) -> Pool:
    return Pool(
        make_broad_feature_frame(frame),
        label=frame["caught"].astype(int) if with_label else None,
        weight=broad_training_weights(frame) if with_label else None,
        cat_features=BROAD_CATEGORICAL_FEATURES,
        feature_names=BROAD_FEATURE_COLUMNS,
    )


def _ensemble_predict(models: list[CatBoostClassifier], frame: pd.DataFrame) -> np.ndarray:
    pool = _pool(frame, with_label=False)
    return np.asarray([model.predict_proba(pool)[:, 1] for model in models]).mean(axis=0)


def _fit_calibrator(labels: np.ndarray, raw: np.ndarray) -> IsotonicRegression:
    if len(np.unique(labels)) < 2 or len(np.unique(raw)) < 3:
        calibrator = IsotonicRegression(out_of_bounds="clip")
        calibrator.fit(np.array([0.0, 1.0]), np.array([0.0, 1.0]))
        return calibrator
    return IsotonicRegression(out_of_bounds="clip").fit(raw, labels)


def _fit_identity_calibrator() -> IsotonicRegression:
    calibrator = IsotonicRegression(out_of_bounds="clip")
    calibrator.fit(np.array([0.0, 1.0]), np.array([0.0, 1.0]))
    return calibrator


def _evaluate_all(
    models: list[CatBoostClassifier], calibrator: IsotonicRegression, splits: DatasetSplits
) -> dict:
    output: dict[str, dict] = {}
    for name, frame in (
        ("validation", splits.validation),
        ("test", splits.test),
        ("lake_holdout", splits.lake_holdout),
    ):
        if frame.empty:
            continue
        probability = calibrator.predict(_ensemble_predict(models, frame))
        output[name] = classification_metrics(frame["caught"].astype(int).to_numpy(), probability)
        output[name]["by_lake"] = segmented_metrics(frame, probability, "lake_id")
        output[name]["by_month"] = segmented_metrics(
            frame.assign(month=pd.to_datetime(frame["period_start"], utc=True).dt.month),
            probability,
            "month",
        )
        output[name]["by_time_precision"] = segmented_metrics(frame, probability, "time_precision")
    prevalence = float(splits.train["caught"].astype(int).mean())
    output["prevalence_baseline"] = classification_metrics(
        splits.test["caught"].astype(int).to_numpy(), np.full(len(splits.test), prevalence)
    )
    return output


def _score_references(frame: pd.DataFrame, probabilities: np.ndarray) -> dict[str, list[float]]:
    enriched = frame[["lake_id", "season_mode"]].copy()
    enriched["probability"] = probabilities
    result = {"global": sorted(float(value) for value in probabilities)}
    for season, group in enriched.groupby("season_mode"):
        result[f"season:{season}"] = sorted(group["probability"].astype(float).tolist())
    for (lake_id, season), group in enriched.groupby(["lake_id", "season_mode"]):
        if len(group) >= 20:
            result[f"lake:{lake_id}:{season}"] = sorted(group["probability"].astype(float).tolist())
    return result


def _version(season: str, frame: pd.DataFrame) -> str:
    return f"trip-broad-{season}-{datetime.now(UTC).strftime('%Y%m%d%H%M%S')}-{_dataset_hash(frame)[:8]}"


def _dataset_hash(frame: pd.DataFrame) -> str:
    hashed = pd.util.hash_pandas_object(frame.sort_values("observation_id"), index=False).values.tobytes()
    return hashlib.sha256(hashed).hexdigest()
