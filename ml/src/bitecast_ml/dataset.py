from __future__ import annotations

import pandas as pd

from .astronomy import astronomy_features
from .weather import attach_weather


def enrich_observations(
    observations: pd.DataFrame,
    historical_weather: pd.DataFrame,
    default_timezone: str = "America/Toronto",
) -> pd.DataFrame:
    """Join historical measurements and calculate astronomy at the observed place and time."""
    enriched = attach_weather(observations, historical_weather)
    astronomy_rows = []
    for row in enriched.to_dict(orient="records"):
        moment = pd.Timestamp(row["hour_start"]).to_pydatetime()
        astronomy_rows.append(
            astronomy_features(
                moment,
                float(row["latitude"]),
                float(row["longitude"]),
                str(row.get("timezone") or default_timezone),
            )
        )
    astronomy = pd.DataFrame(astronomy_rows, index=enriched.index)
    for column in astronomy:
        enriched[column] = astronomy[column]
    return enriched
