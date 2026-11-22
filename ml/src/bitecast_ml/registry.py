from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path


class ModelRegistry:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.index_path = root / "registry.json"
        self.root.mkdir(parents=True, exist_ok=True)

    def read(self) -> dict:
        if not self.index_path.exists():
            return {"models": [], "champions": {}, "canaries": {}}
        registry = json.loads(self.index_path.read_text())
        registry.setdefault("canaries", {})
        return registry

    def register(self, artifact_dir: Path, artifact_reference: Path | None = None) -> dict:
        registry = self.read()
        metadata = json.loads((artifact_dir / "metadata.json").read_text())
        metrics = json.loads((artifact_dir / "metrics.json").read_text())
        entry = {
            "version": metadata["version"],
            "season_mode": metadata["season_mode"],
            "model_family": metadata.get("model_family", "hourly"),
            "prediction_granularity": metadata.get("prediction_granularity", "hour"),
            "artifact_dir": str(
                artifact_reference if artifact_reference is not None else artifact_dir.resolve()
            ),
            "status": "challenger",
            "registered_at": datetime.now(UTC).isoformat(),
            "metrics": metrics,
            "canary_only": bool(metadata.get("canary_only", False)),
        }
        registry["models"] = [item for item in registry["models"] if item["version"] != entry["version"]]
        registry["models"].append(entry)
        self._write(registry)
        return entry

    def promote(self, version: str, require_improvement: bool = True) -> None:
        registry = self.read()
        challenger = next((item for item in registry["models"] if item["version"] == version), None)
        if challenger is None:
            raise ValueError(f"Unknown model version: {version}")
        if challenger.get("canary_only"):
            raise ValueError("Canary-only models cannot be promoted to production champion")
        season = challenger["season_mode"]
        family = challenger.get("model_family", "hourly")
        champion_key = self._champion_key(season, family)
        champion_version = registry["champions"].get(champion_key)
        if champion_version is None and family == "hourly":
            champion_version = registry["champions"].get(season)
        champion = next((item for item in registry["models"] if item["version"] == champion_version), None)
        if require_improvement and champion and not _passes_gate(challenger, champion):
            raise ValueError("Challenger did not pass the champion promotion gate")
        for item in registry["models"]:
            if (
                item["season_mode"] == season
                and item.get("model_family", "hourly") == family
                and item["status"] == "champion"
            ):
                item["status"] = "archived"
        challenger["status"] = "champion"
        challenger["promoted_at"] = datetime.now(UTC).isoformat()
        if family == "hourly":
            registry["champions"].pop(season, None)
        registry["champions"][champion_key] = version
        self._write(registry)

    def champion_path(self, season: str, model_family: str = "hourly") -> Path:
        registry = self.read()
        version = registry["champions"].get(self._champion_key(season, model_family))
        if version is None and model_family == "hourly":
            version = registry["champions"].get(season)
        entry = next((item for item in registry["models"] if item["version"] == version), None)
        if entry is None:
            raise ValueError(f"No {model_family} champion registered for {season}")
        return Path(entry["artifact_dir"])

    def activate_canary(self, version: str) -> None:
        registry = self.read()
        entry = next((item for item in registry["models"] if item["version"] == version), None)
        if entry is None:
            raise ValueError(f"Unknown model version: {version}")
        if not entry.get("canary_only"):
            raise ValueError("Only canary-only models can be activated as early access")
        season = entry["season_mode"]
        family = entry.get("model_family", "hourly")
        for item in registry["models"]:
            if (
                item["season_mode"] == season
                and item.get("model_family", "hourly") == family
                and item["status"] == "canary"
            ):
                item["status"] = "challenger"
        entry["status"] = "canary"
        entry["activated_at"] = datetime.now(UTC).isoformat()
        registry["canaries"][self._champion_key(season, family)] = version
        self._write(registry)

    def available_champion_path(
        self, season: str, allow_canary: bool = False
    ) -> tuple[Path, str]:
        """Prefer the precise hourly family, then fall back to the broad family."""
        for family in ("hourly", "trip_broad"):
            try:
                return self.champion_path(season, family), family
            except ValueError:
                continue
        if allow_canary:
            registry = self.read()
            for family in ("hourly", "trip_broad"):
                version = registry["canaries"].get(self._champion_key(season, family))
                entry = next(
                    (item for item in registry["models"] if item["version"] == version),
                    None,
                )
                if entry is not None and entry.get("canary_only"):
                    return Path(entry["artifact_dir"]), family
        raise ValueError(f"No hourly or trip_broad champion registered for {season}")

    @staticmethod
    def _champion_key(season: str, model_family: str) -> str:
        return f"{model_family}:{season}"

    def _write(self, registry: dict) -> None:
        self.index_path.write_text(json.dumps(registry, indent=2) + "\n")


def _passes_gate(challenger: dict, champion: dict) -> bool:
    new = challenger["metrics"]["test"]
    old = champion["metrics"]["test"]
    return new["brier"] <= old["brier"] * 1.02 and new["top_20_lift"] >= old["top_20_lift"] * 0.98
