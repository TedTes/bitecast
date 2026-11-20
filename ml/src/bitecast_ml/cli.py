from __future__ import annotations

import json
import os
from pathlib import Path

import httpx
import pandas as pd
import typer

from .broad import enrich_broad_from_weather_provider, enrich_broad_observations
from .broad_ingestion import aggregate_hourly_logs_to_broad, longpoint_reports_to_broad
from .broad_training import BroadTrainingConfig, train_broad_model
from .contracts import BROAD_FEATURE_CONTRACT_VERSION, BroadTrainingRow, TrainingRow
from .dataset import enrich_from_normalized_environment, enrich_from_weather_provider, enrich_observations
from .export import export_consented_logs
from .ingestion import ingest_canonical_file
from .model import ModelBundle
from .publication import promote_remote, publish_challenger
from .registry import ModelRegistry
from .retraining import scheduled_broad_retrain, scheduled_retrain
from .snapshot import create_training_snapshot
from .source_registry import SourceRegistry
from .supabase_rest import SupabaseRest
from .synthetic import generate_synthetic_training_data
from .training import TrainingConfig, train_model
from .validation import validate_broad_training_frame, validate_training_frame
from .weather import ContractHttpWeatherProvider
from .worker import run_forecast_worker

app = typer.Typer(no_args_is_help=True, help="BiteCast custom-model lifecycle")


@app.command("write-schema")
def write_schema(output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(TrainingRow.model_json_schema(), indent=2) + "\n")
    typer.echo(f"Wrote training-row schema to {output}")


@app.command("write-broad-schema")
def write_broad_schema(output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(BroadTrainingRow.model_json_schema(), indent=2) + "\n")
    typer.echo(f"Wrote broad training-row schema to {output}")


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


@app.command("validate-broad")
def validate_broad(input_path: Path, output_dir: Path) -> None:
    report = validate_broad_training_frame(_read_frame(input_path))
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


@app.command("enrich-broad")
def enrich_broad(observations: Path, historical_weather: Path, output: Path) -> None:
    frame = enrich_broad_observations(_read_frame(observations), _read_frame(historical_weather))
    _write_frame(frame, output)
    typer.echo(f"Wrote {len(frame)} environment-enriched broad trip rows to {output}")


@app.command("enrich-broad-provider")
def enrich_broad_provider(observations: Path, output: Path) -> None:
    required = ["HISTORICAL_WEATHER_URL", "HISTORICAL_WEATHER_API_KEY"]
    missing = [name for name in required if not os.getenv(name)]
    if missing:
        raise typer.BadParameter(f"Missing environment values: {', '.join(missing)}")
    provider = ContractHttpWeatherProvider(
        os.environ["HISTORICAL_WEATHER_URL"], os.environ["HISTORICAL_WEATHER_API_KEY"]
    )
    frame = enrich_broad_from_weather_provider(_read_frame(observations), provider)
    _write_frame(frame, output)
    typer.echo(f"Wrote {len(frame)} provider-enriched broad trip rows to {output}")


@app.command("aggregate-user-logs-broad")
def aggregate_user_logs_broad(input_path: Path, output: Path) -> None:
    frame = aggregate_hourly_logs_to_broad(_validated(_read_frame(input_path)))
    _write_frame(frame, output)
    typer.echo(f"Aggregated {len(frame)} consented user trips for the broad model")


@app.command("enrich-normalized")
def enrich_normalized(
    observations: Path,
    historical_weather: Path,
    output: Path,
    water_conditions: Path | None = None,
    lake_clarity: Path | None = None,
) -> None:
    frame = enrich_from_normalized_environment(
        _read_frame(observations),
        _read_frame(historical_weather),
        _read_frame(water_conditions) if water_conditions else None,
        _read_frame(lake_clarity) if lake_clarity else None,
    )
    _write_frame(frame, output)
    typer.echo(f"Wrote {len(frame)} normalized-environment training rows to {output}")


@app.command("enrich-provider")
def enrich_provider(observations: Path, output: Path) -> None:
    required = ["HISTORICAL_WEATHER_URL", "HISTORICAL_WEATHER_API_KEY"]
    missing = [name for name in required if not os.getenv(name)]
    if missing:
        raise typer.BadParameter(f"Missing environment values: {', '.join(missing)}")
    provider = ContractHttpWeatherProvider(
        os.environ["HISTORICAL_WEATHER_URL"], os.environ["HISTORICAL_WEATHER_API_KEY"]
    )
    frame = enrich_from_weather_provider(_read_frame(observations), provider)
    _write_frame(frame, output)
    typer.echo(f"Wrote {len(frame)} provider-enriched training rows to {output}")


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


@app.command("train-broad")
def train_broad(
    input_path: Path, artifact_root: Path, season: str, iterations: int = 500, ensemble_size: int = 3
) -> None:
    frame = _validated_broad(_read_frame(input_path))
    result = train_broad_model(
        frame,
        artifact_root,
        BroadTrainingConfig(
            season_mode=season,
            iterations=iterations,
            ensemble_size=ensemble_size,
        ),
    )
    typer.echo(
        json.dumps(
            {"version": result.version, "artifact_dir": str(result.artifact_dir), "metrics": result.metrics},
            indent=2,
        )
    )


@app.command("train-broad-canary")
def train_broad_canary(input_path: Path, artifact_root: Path, season: str) -> None:
    frame = _validated_broad(_read_frame(input_path))
    result = train_broad_model(
        frame,
        artifact_root,
        BroadTrainingConfig(
            season_mode=season,
            iterations=80,
            depth=3,
            learning_rate=0.03,
            ensemble_size=3,
            minimum_rows=4,
            minimum_positive_rows=1,
            canary_only=True,
        ),
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
def register(
    artifact_dir: Path,
    registry_dir: Path,
    artifact_reference: Path | None = None,
) -> None:
    entry = ModelRegistry(registry_dir).register(artifact_dir, artifact_reference)
    typer.echo(json.dumps(entry, indent=2))


@app.command()
def promote(version: str, registry_dir: Path, force: bool = False) -> None:
    ModelRegistry(registry_dir).promote(version, require_improvement=not force)
    typer.echo(f"Promoted {version}")


@app.command("activate-canary")
def activate_canary(version: str, registry_dir: Path) -> None:
    ModelRegistry(registry_dir).activate_canary(version)
    typer.echo(f"Activated early-access canary {version}")


@app.command("publish-model")
def publish_model(artifact_dir: Path, artifact_uri: str) -> None:
    db = _service_db()
    typer.echo(json.dumps(publish_challenger(db, artifact_dir, artifact_uri), indent=2))


@app.command("promote-remote")
def promote_remote_model(version: str, season: str, model_family: str = "hourly") -> None:
    promote_remote(_service_db(), version, season, model_family)
    typer.echo(f"Promoted remote model {version}")


@app.command("prepare-longpoint-broad")
def prepare_longpoint_broad(
    input_path: Path,
    output: Path,
    rejected_output: Path,
    authorize_source: bool = False,
) -> None:
    accepted, rejected = longpoint_reports_to_broad(
        _read_frame(input_path),
        authorize_source=authorize_source,
    )
    _write_frame(accepted, output)
    _write_frame(rejected, rejected_output)
    typer.echo(json.dumps({"accepted": len(accepted), "rejected": len(rejected)}, indent=2))


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


@app.command("scheduled-retrain-broad")
def retrain_broad(
    input_path: Path,
    artifact_root: Path,
    registry_dir: Path,
    state_path: Path,
    minimum_new_rows: int = 250,
    auto_promote: bool = False,
) -> None:
    report = scheduled_broad_retrain(
        _validated_broad(_read_frame(input_path)),
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


@app.command("snapshot-training-data")
def snapshot_training_data(input_path: Path, output_root: Path) -> None:
    snapshot = create_training_snapshot(_validated(_read_frame(input_path)), output_root)
    typer.echo(
        json.dumps(
            {
                "dataset_hash": snapshot.dataset_hash,
                "rows": snapshot.row_count,
                "directory": str(snapshot.directory),
            },
            indent=2,
        )
    )


@app.command("snapshot-broad-training-data")
def snapshot_broad_training_data(input_path: Path, output_root: Path) -> None:
    snapshot = create_training_snapshot(
        _validated_broad(_read_frame(input_path)),
        output_root,
        feature_contract_version=BROAD_FEATURE_CONTRACT_VERSION,
        model_family="trip_broad",
    )
    typer.echo(
        json.dumps(
            {
                "dataset_hash": snapshot.dataset_hash,
                "rows": snapshot.row_count,
                "directory": str(snapshot.directory),
            },
            indent=2,
        )
    )


@app.command("forecast-worker")
def forecast_worker(horizon_days: int = 7) -> None:
    typer.echo(json.dumps(run_forecast_worker(horizon_days), indent=2))


def _validated(frame: pd.DataFrame) -> pd.DataFrame:
    report = validate_training_frame(frame)
    if report.issues:
        raise typer.BadParameter(f"Dataset has {len(report.issues)} rejected rows; run validate first")
    return report.valid


def _validated_broad(frame: pd.DataFrame) -> pd.DataFrame:
    report = validate_broad_training_frame(frame)
    if report.issues:
        raise typer.BadParameter(
            f"Broad dataset has {len(report.issues)} rejected rows; run validate-broad first"
        )
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
