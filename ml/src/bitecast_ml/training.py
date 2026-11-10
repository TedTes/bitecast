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

from .contracts import FEATURE_CONTRACT_VERSION
from .evaluation import classification_metrics, segmented_metrics
from .features import CATEGORICAL_FEATURES, FEATURE_COLUMNS, make_feature_frame, training_weights
from .splits import DatasetSplits, leakage_safe_split


@dataclass(frozen=True)
class TrainingConfig:
    season_mode: str
    iterations: int = 500
    depth: int = 7
    learning_rate: float = 0.04
    ensemble_size: int = 3
    minimum_rows: int = 200
    minimum_positive_rows: int = 20
    random_seed: int = 4107


@dataclass(frozen=True)
class TrainingResult:
    version: str
    artifact_dir: Path
    metrics: dict


def train_model(frame: pd.DataFrame, output_root: Path, config: TrainingConfig) -> TrainingResult:
    data = frame[frame["season_mode"].astype(str) == config.season_mode].copy()
    if len(data) < config.minimum_rows:
        raise ValueError(
            f"Need at least {config.minimum_rows} {config.season_mode} rows; received {len(data)}"
        )
    positive_rows = int(data["caught"].astype(bool).sum())
    if positive_rows < config.minimum_positive_rows or positive_rows >= len(data):
        raise ValueError("Training requires sufficient positive and negative outcomes")
    splits = leakage_safe_split(data)
    version = _version(config.season_mode, data)
    artifact_dir = output_root / version
    models_dir = artifact_dir / "models"
    models_dir.mkdir(parents=True, exist_ok=False)

    train_pool = _pool(splits.train, with_label=True)
    validation_pool = _pool(splits.validation, with_label=True)
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
        model.fit(train_pool, eval_set=validation_pool, use_best_model=True, early_stopping_rounds=60)
        model.save_model(models_dir / f"seed-{config.random_seed + offset}.cbm")
        models.append(model)

    raw_validation = _ensemble_predict(models, splits.validation)
    calibrator = _fit_calibrator(splits.validation["caught"].astype(int).to_numpy(), raw_validation)
    calibration = {"x": calibrator.X_thresholds_.tolist(), "y": calibrator.y_thresholds_.tolist()}
    (artifact_dir / "calibration.json").write_text(json.dumps(calibration, indent=2) + "\n")

    metrics = _evaluate_all(models, calibrator, splits)
    train_probabilities = calibrator.predict(_ensemble_predict(models, splits.train))
    references = _score_references(splits.train, train_probabilities)
    (artifact_dir / "score_references.json").write_text(json.dumps(references, indent=2) + "\n")

    metadata = {
        "version": version,
        "created_at": datetime.now(UTC).isoformat(),
        "season_mode": config.season_mode,
        "feature_contract_version": FEATURE_CONTRACT_VERSION,
        "dataset_hash": _dataset_hash(data),
        "training_rows": len(splits.train),
        "validation_rows": len(splits.validation),
        "test_rows": len(splits.test),
        "lake_holdout_rows": len(splits.lake_holdout),
        "held_out_lakes": list(splits.held_out_lakes),
        "feature_columns": FEATURE_COLUMNS,
        "categorical_features": CATEGORICAL_FEATURES,
        "lake_counts": {
            str(key): int(value) for key, value in splits.train["lake_id"].value_counts().items()
        },
        "known_categories": {
            column: sorted(splits.train[column].fillna("unknown").astype(str).unique().tolist())
            for column in CATEGORICAL_FEATURES
        },
        "minimum_confidence": 0.25,
        "config": asdict(config),
    }
    (artifact_dir / "metadata.json").write_text(json.dumps(metadata, indent=2) + "\n")
    (artifact_dir / "metrics.json").write_text(json.dumps(metrics, indent=2) + "\n")
    return TrainingResult(version, artifact_dir, metrics)


def _pool(frame: pd.DataFrame, with_label: bool) -> Pool:
    features = make_feature_frame(frame)
    return Pool(
        features,
        label=frame["caught"].astype(int) if with_label else None,
        weight=training_weights(frame) if with_label else None,
        cat_features=CATEGORICAL_FEATURES,
        feature_names=FEATURE_COLUMNS,
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
            frame.assign(month=pd.to_datetime(frame["hour_start"], utc=True).dt.month), probability, "month"
        )
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
    digest = _dataset_hash(frame)[:8]
    return f"{season}-{datetime.now(UTC).strftime('%Y%m%d%H%M%S')}-{digest}"


def _dataset_hash(frame: pd.DataFrame) -> str:
    hashed = pd.util.hash_pandas_object(frame.sort_values("observation_id"), index=False).values.tobytes()
    return hashlib.sha256(hashed).hexdigest()
