from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
from catboost import CatBoostClassifier, Pool

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

    def predict(self, raw_rows: pd.DataFrame, with_reasons: bool = True) -> pd.DataFrame:
        if raw_rows.empty:
            return raw_rows.copy()
        features = make_feature_frame(raw_rows)
        pool = Pool(features, cat_features=CATEGORICAL_FEATURES, feature_names=FEATURE_COLUMNS)
        ensemble = np.asarray([model.predict_proba(pool)[:, 1] for model in self.models])
        probabilities = self._calibrate(ensemble.mean(axis=0))
        confidence_scores, confidence_labels = confidence_for_rows(
            raw_rows,
            ensemble,
            self.metadata["lake_counts"],
            self.metadata["known_categories"],
        )
        outputs = raw_rows[["lake_id", "hour_start", "season_mode"]].copy()
        outputs["raw_probability"] = probabilities
        outputs["confidence_score"] = confidence_scores
        outputs["confidence"] = confidence_labels
        outputs["forecast_available"] = confidence_scores >= self.metadata.get("minimum_confidence", 0.25)
        outputs["model_version"] = self.version
        outputs["bite_score"] = [
            percentile_score(
                probability,
                self._reference(str(row["lake_id"]), str(row["season_mode"])),
            )
            for probability, (_, row) in zip(probabilities, raw_rows.iterrows(), strict=True)
        ]
        if with_reasons:
            shap = self.models[0].get_feature_importance(pool, type="ShapValues")
            outputs["reasons"] = [reasons_from_shap(FEATURE_COLUMNS, row) for row in shap]
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
