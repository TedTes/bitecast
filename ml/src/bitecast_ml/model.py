from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
from catboost import CatBoostClassifier, Pool

from .broad import broad_confidence_for_rows, make_broad_feature_frame
from .confidence import confidence_for_rows
from .explanations import reasons_from_shap
from .features import CATEGORICAL_FEATURES, FEATURE_COLUMNS, make_feature_frame
from .scoring import percentile_score


class ModelBundle:
    def __init__(self, artifact_dir: Path) -> None:
        self.artifact_dir = artifact_dir
        self.metadata = json.loads((artifact_dir / "metadata.json").read_text())
        self.calibration = json.loads((artifact_dir / "calibration.json").read_text())
        self.references = json.loads((artifact_dir / "score_references.json").read_text())
        self.models: list[CatBoostClassifier] = []
        for path in sorted((artifact_dir / "models").glob("*.cbm")):
            model = CatBoostClassifier()
            model.load_model(path)
            self.models.append(model)
        if not self.models:
            raise ValueError(f"No CatBoost models found in {artifact_dir}")

    @property
    def version(self) -> str:
        return str(self.metadata["version"])

    @property
    def model_family(self) -> str:
        return str(self.metadata.get("model_family", "hourly"))

    @property
    def prediction_granularity(self) -> str:
        return str(self.metadata.get("prediction_granularity", "hour"))

    def predict(self, raw_rows: pd.DataFrame, with_reasons: bool = True) -> pd.DataFrame:
        if raw_rows.empty:
            return raw_rows.copy()
        broad = self.model_family == "trip_broad"
        features = make_broad_feature_frame(raw_rows) if broad else make_feature_frame(raw_rows)
        feature_columns = list(self.metadata.get("feature_columns", FEATURE_COLUMNS))
        categorical_features = list(self.metadata.get("categorical_features", CATEGORICAL_FEATURES))
        pool = Pool(features, cat_features=categorical_features, feature_names=feature_columns)
        ensemble = np.asarray([model.predict_proba(pool)[:, 1] for model in self.models])
        probabilities = self._calibrate(ensemble.mean(axis=0))
        confidence_function = broad_confidence_for_rows if broad else confidence_for_rows
        confidence_scores, confidence_labels = confidence_function(
            raw_rows,
            ensemble,
            self.metadata["lake_counts"],
            self.metadata["known_categories"],
        )
        confidence_cap = float(self.metadata.get("confidence_cap", 1.0))
        confidence_scores = np.minimum(confidence_scores, confidence_cap)
        if self.metadata.get("canary_only"):
            confidence_labels = ["Low"] * len(confidence_labels)
        identity_columns = ["lake_id", "season_mode"]
        if broad:
            identity_columns += ["period_start", "period_end", "time_block", "time_precision"]
        else:
            identity_columns += ["hour_start"]
        outputs = raw_rows[identity_columns].copy()
        outputs["raw_probability"] = probabilities
        outputs["confidence_score"] = confidence_scores
        outputs["confidence"] = confidence_labels
        outputs["forecast_available"] = confidence_scores >= self.metadata.get("minimum_confidence", 0.25)
        outputs["model_version"] = self.version
        outputs["model_family"] = self.model_family
        outputs["prediction_granularity"] = self.prediction_granularity
        score_cap = int(self.metadata.get("score_cap", 100))
        outputs["bite_score"] = [
            min(
                score_cap,
                percentile_score(
                    probability,
                    self._reference(str(row["lake_id"]), str(row["season_mode"])),
                ),
            )
            for probability, (_, row) in zip(probabilities, raw_rows.iterrows(), strict=True)
        ]
        if with_reasons:
            shap = self.models[0].get_feature_importance(pool, type="ShapValues")
            outputs["reasons"] = [reasons_from_shap(feature_columns, row) for row in shap]
        else:
            outputs["reasons"] = [[] for _ in range(len(outputs))]
        return outputs

    def _calibrate(self, values: np.ndarray) -> np.ndarray:
        x = np.asarray(self.calibration["x"], dtype=float)
        y = np.asarray(self.calibration["y"], dtype=float)
        return np.clip(np.interp(values, x, y), 0, 1)

    def _reference(self, lake_id: str, season: str) -> list[float]:
        return (
            self.references.get(f"lake:{lake_id}:{season}")
            or self.references.get(f"season:{season}")
            or self.references["global"]
        )
