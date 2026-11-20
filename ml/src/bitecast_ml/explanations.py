from __future__ import annotations

import numpy as np

PHRASES: dict[str, tuple[str, str]] = {
    "solar_elevation_deg": ("Light level supports this window", "Light level works against this window"),
    "minutes_from_sunrise": ("Timing aligns with the sunrise transition", "Timing is away from sunrise"),
    "minutes_from_sunset": ("Timing aligns with the sunset transition", "Timing is away from sunset"),
    "cloud_pct": ("Cloud cover softens the light", "Clearer skies increase the light"),
    "wind_kmh": ("Wind conditions improve the model outlook", "Wind conditions reduce the model outlook"),
    "pressure_hpa": ("Pressure pattern supports activity", "Pressure pattern lowers the outlook"),
    "pressure_change_3h_hpa": (
        "Pressure movement supports this hour",
        "Pressure movement works against this hour",
    ),
    "air_temp_c": (
        "Temperature pattern matches productive history",
        "Temperature is outside productive history",
    ),
    "water_temp_c": (
        "Water temperature matches productive history",
        "Water temperature is less favourable historically",
    ),
    "moon_illumination": (
        "Moon conditions add a small positive signal",
        "Moon conditions add a small negative signal",
    ),
    "fishing_depth_m": ("Depth matches productive observations", "Depth has weaker historical support"),
    "water_clarity": (
        "Water clarity matches productive observations",
        "Water clarity has weaker historical support",
    ),
    "season_mode": ("Seasonal pattern supports this hour", "Seasonal pattern lowers the outlook"),
}


def reasons_from_shap(feature_names: list[str], shap_values: np.ndarray, limit: int = 3) -> list[str]:
    contributions = shap_values[:-1] if len(shap_values) == len(feature_names) + 1 else shap_values
    reasons: list[str] = []
    for index in np.argsort(np.abs(contributions))[::-1]:
        phrase = PHRASES.get(feature_names[int(index)])
        if phrase is None or abs(float(contributions[int(index)])) < 1e-6:
            continue
        text = phrase[0] if contributions[int(index)] > 0 else phrase[1]
        if text not in reasons:
            reasons.append(text)
        if len(reasons) == limit:
            break
    return reasons or ["The model found a mixed set of historical signals"]
