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
            return {"models": [], "champions": {}}
        return json.loads(self.index_path.read_text())

    def register(self, artifact_dir: Path) -> dict:
        registry = self.read()
        metadata = json.loads((artifact_dir / "metadata.json").read_text())
        metrics = json.loads((artifact_dir / "metrics.json").read_text())
        entry = {
            "version": metadata["version"],
            "season_mode": metadata["season_mode"],
            "artifact_dir": str(artifact_dir.resolve()),
            "status": "challenger",
            "registered_at": datetime.now(UTC).isoformat(),
            "metrics": metrics,
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
        season = challenger["season_mode"]
        champion_version = registry["champions"].get(season)
        champion = next((item for item in registry["models"] if item["version"] == champion_version), None)
        if require_improvement and champion and not _passes_gate(challenger, champion):
            raise ValueError("Challenger did not pass the champion promotion gate")
        for item in registry["models"]:
            if item["season_mode"] == season and item["status"] == "champion":
                item["status"] = "archived"
        challenger["status"] = "champion"
        challenger["promoted_at"] = datetime.now(UTC).isoformat()
        registry["champions"][season] = version
        self._write(registry)

    def champion_path(self, season: str) -> Path:
        registry = self.read()
        version = registry["champions"].get(season)
        entry = next((item for item in registry["models"] if item["version"] == version), None)
        if entry is None:
            raise ValueError(f"No champion registered for {season}")
        return Path(entry["artifact_dir"])

    def _write(self, registry: dict) -> None:
        self.index_path.write_text(json.dumps(registry, indent=2) + "\n")


def _passes_gate(challenger: dict, champion: dict) -> bool:
    new = challenger["metrics"]["test"]
    old = champion["metrics"]["test"]
    return new["brier"] <= old["brier"] * 1.02 and new["top_20_lift"] >= old["top_20_lift"] * 0.98
