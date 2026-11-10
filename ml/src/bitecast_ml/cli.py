from __future__ import annotations

import json
import os
from pathlib import Path

import httpx
import pandas as pd
import typer

from .contracts import TrainingRow
from .dataset import enrich_observations
from .export import export_consented_logs
from .ingestion import ingest_canonical_file
from .model import ModelBundle
from .publication import promote_remote, publish_challenger
from .registry import ModelRegistry
from .retraining import scheduled_retrain
from .source_registry import SourceRegistry
from .supabase_rest import SupabaseRest
from .synthetic import generate_synthetic_training_data
from .training import TrainingConfig, train_model
from .validation import validate_training_frame
from .worker import run_forecast_worker

app = typer.Typer(no_args_is_help=True, help="BiteCast custom-model lifecycle")


@app.command("write-schema")
def write_schema(output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(TrainingRow.model_json_schema(), indent=2) + "\n")
    typer.echo(f"Wrote training-row schema to {output}")


@app.command("generate-fixture")
def generate_fixture(output: Path, rows: int = 3000, seed: int = 4107) -> None:
    frame = generate_synthetic_training_data(rows, seed)
    _write_frame(frame, output)
    typer.echo(f"Wrote {len(frame)} synthetic development rows to {output}")


@app.command()
def validate(input_path: Path, output_dir: Path) -> None:
    report = validate_training_frame(_read_frame(input_path))
    output_dir.mkdir(parents=True, exist_ok=True)
    report.valid.to_parquet(output_dir / "valid.parquet", index=False)
    report.rejected.to_parquet(output_dir / "rejected.parquet", index=False)
    (output_dir / "report.json").write_text(json.dumps(report.summary, indent=2) + "\n")
    (output_dir / "quality.json").write_text(json.dumps(report.quality, indent=2) + "\n")
    typer.echo(json.dumps(report.summary, indent=2))
    if report.summary["valid_rows"] == 0:
        raise typer.Exit(1)


@app.command()
def enrich(observations: Path, historical_weather: Path, output: Path) -> None:
    frame = enrich_observations(_read_frame(observations), _read_frame(historical_weather))
    _write_frame(frame, output)
    typer.echo(f"Wrote {len(frame)} enriched angler-hours to {output}")


@app.command()
def ingest(input_path: Path, output_root: Path, source_id: str, registry_path: Path) -> None:
    result = ingest_canonical_file(input_path, output_root, source_id, SourceRegistry.load(registry_path))
    typer.echo(
        json.dumps(
            {"normalized": str(result.normalized_path), "rows": result.row_count, "sha256": result.sha256},
            indent=2,
        )
    )


@app.command()
def train(
    input_path: Path, artifact_root: Path, season: str, iterations: int = 500, ensemble_size: int = 3
) -> None:
    frame = _validated(_read_frame(input_path))
    result = train_model(
        frame,
        artifact_root,
        TrainingConfig(season_mode=season, iterations=iterations, ensemble_size=ensemble_size),
    )
    typer.echo(
        json.dumps(
            {"version": result.version, "artifact_dir": str(result.artifact_dir), "metrics": result.metrics},
            indent=2,
        )
    )


@app.command()
def infer(input_path: Path, artifact_dir: Path, output: Path) -> None:
    predictions = ModelBundle(artifact_dir).predict(_read_frame(input_path))
    _write_frame(predictions, output)
    typer.echo(f"Wrote {len(predictions)} predictions to {output}")


@app.command()
def register(artifact_dir: Path, registry_dir: Path) -> None:
    entry = ModelRegistry(registry_dir).register(artifact_dir)
    typer.echo(json.dumps(entry, indent=2))


@app.command()
def promote(version: str, registry_dir: Path, force: bool = False) -> None:
    ModelRegistry(registry_dir).promote(version, require_improvement=not force)
    typer.echo(f"Promoted {version}")


@app.command("publish-model")
def publish_model(artifact_dir: Path, artifact_uri: str) -> None:
    db = _service_db()
    typer.echo(json.dumps(publish_challenger(db, artifact_dir, artifact_uri), indent=2))


@app.command("promote-remote")
def promote_remote_model(version: str, season: str) -> None:
    promote_remote(_service_db(), version, season)
    typer.echo(f"Promoted remote model {version}")


@app.command("scheduled-retrain")
def retrain(
    input_path: Path,
    artifact_root: Path,
    registry_dir: Path,
    state_path: Path,
    minimum_new_rows: int = 1000,
    auto_promote: bool = False,
) -> None:
    report = scheduled_retrain(
        _validated(_read_frame(input_path)),
        artifact_root,
        ModelRegistry(registry_dir),
        state_path,
        minimum_new_rows,
        auto_promote,
    )
    typer.echo(json.dumps(report, indent=2))


@app.command("export-supabase")
def export_supabase(output: Path) -> None:
    if not os.getenv("TRAINING_PSEUDONYM_KEY"):
        raise typer.BadParameter("Missing environment value: TRAINING_PSEUDONYM_KEY")
    db = _service_db()
    frame = export_consented_logs(db, os.environ["TRAINING_PSEUDONYM_KEY"])
    _write_frame(frame, output)
    typer.echo(f"Exported {len(frame)} consented angler-hours")


@app.command("fetch-base-data")
def fetch_base_data(output: Path) -> None:
    url = os.getenv("BASE_TRAINING_DATA_URL")
    if not url:
        raise typer.BadParameter("Missing environment value: BASE_TRAINING_DATA_URL")
    token = os.getenv("BASE_TRAINING_DATA_TOKEN")
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    with httpx.stream("GET", url, headers=headers, follow_redirects=True, timeout=120) as response:
        response.raise_for_status()
        output.parent.mkdir(parents=True, exist_ok=True)
        with output.open("wb") as destination:
            for chunk in response.iter_bytes():
                destination.write(chunk)
    typer.echo(f"Downloaded curated base dataset to {output}")


@app.command("combine-datasets")
def combine_datasets(base_path: Path, user_logs_path: Path, output: Path) -> None:
    base = _read_frame(base_path)
    user_logs = _read_frame(user_logs_path)
    combined = pd.concat([base, user_logs], ignore_index=True, sort=False)
    _write_frame(combined, output)
    typer.echo(f"Combined {len(base)} base rows and {len(user_logs)} user-log rows into {len(combined)} rows")


@app.command("forecast-worker")
def forecast_worker(horizon_days: int = 7) -> None:
    typer.echo(json.dumps(run_forecast_worker(horizon_days), indent=2))


def _validated(frame: pd.DataFrame) -> pd.DataFrame:
    report = validate_training_frame(frame)
    if report.issues:
        raise typer.BadParameter(f"Dataset has {len(report.issues)} rejected rows; run validate first")
    return report.valid


def _service_db() -> SupabaseRest:
    required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]
    missing = [name for name in required if not os.getenv(name)]
    if missing:
        raise typer.BadParameter(f"Missing environment values: {', '.join(missing)}")
    return SupabaseRest(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])


def _read_frame(path: Path) -> pd.DataFrame:
    return pd.read_parquet(path) if path.suffix == ".parquet" else pd.read_csv(path)


def _write_frame(frame: pd.DataFrame, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.suffix == ".parquet":
        frame.to_parquet(path, index=False)
    elif path.suffix == ".json":
        path.write_text(frame.to_json(orient="records", date_format="iso", indent=2) + "\n")
    else:
        frame.to_csv(path, index=False)
