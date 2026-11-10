from __future__ import annotations

from bitecast_ml.ingestion import expand_trip_to_angler_hours


def test_trip_expands_to_effort_hours_and_places_catch_in_correct_hour() -> None:
    rows = expand_trip_to_angler_hours(
        {
            "trip_id": "trip-1",
            "trip_started_at": "2026-06-01T06:30:00-04:00",
            "trip_ended_at": "2026-06-01T08:15:00-04:00",
            "caught_at": "2026-06-01T07:20:00-04:00",
            "caught": True,
            "catch_count": 2,
        }
    )
    assert [row["effort_minutes"] for row in rows] == [30, 60, 15]
    assert [row["caught"] for row in rows] == [False, True, False]
    assert [row["catch_count"] for row in rows] == [0, 2, 0]
