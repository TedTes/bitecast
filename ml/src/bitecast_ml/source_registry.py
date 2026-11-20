from __future__ import annotations

import json
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field


class DataSource(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    owner: str
    license: str
    commercial_use_allowed: bool
    redistribution_allowed: bool
    geographic_coverage: str
    date_range: str
    contains_no_catch: bool
    contains_effort: bool
    timestamp_precision: str
    location_precision: str
    known_biases: list[str] = Field(default_factory=list)
    quality_weight: float = Field(ge=0, le=1)

    @property
    def eligible_for_training(self) -> bool:
        return self.commercial_use_allowed and self.contains_effort


class SourceRegistry:
    def __init__(self, sources: list[DataSource]) -> None:
        self.sources = {source.id: source for source in sources}

    @classmethod
    def load(cls, path: Path) -> SourceRegistry:
        raw = json.loads(path.read_text())
        return cls([DataSource.model_validate(item) for item in raw["sources"]])

    def require_eligible(self, source_id: str) -> DataSource:
        source = self.sources.get(source_id)
        if source is None:
            raise ValueError(f"Unknown data source: {source_id}")
        if not source.eligible_for_training:
            raise ValueError(f"Source {source_id} is not approved for model training")
        return source
