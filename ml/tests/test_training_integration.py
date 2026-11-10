from __future__ import annotations

from bitecast_ml.model import ModelBundle
from bitecast_ml.synthetic import generate_synthetic_training_data
from bitecast_ml.training import TrainingConfig, train_model


def test_train_save_load_and_predict(tmp_path) -> None:
    data = generate_synthetic_training_data(1200)
    result = train_model(
        data,
        tmp_path,
        TrainingConfig(
            season_mode="open_water",
            iterations=35,
            depth=5,
            ensemble_size=2,
            minimum_rows=100,
            minimum_positive_rows=10,
        ),
    )
    bundle = ModelBundle(result.artifact_dir)
    sample = data[data.season_mode == "open_water"].head(8)
    predictions = bundle.predict(sample)
    assert len(predictions) == 8
    assert predictions.bite_score.between(0, 100).all()
    assert predictions.raw_probability.between(0, 1).all()
    assert predictions.reasons.map(len).min() >= 1
    assert "test" in result.metrics
