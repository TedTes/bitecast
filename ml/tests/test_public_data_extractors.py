from __future__ import annotations

import importlib.util
from pathlib import Path
from types import ModuleType


def _tool(name: str) -> ModuleType:
    path = Path(__file__).parents[1] / "tools" / f"{name}.py"
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_targeted_longpoint_no_catch_report_is_extracted_without_hour_expansion() -> None:
    module = _tool("extract_longpoint_reports")
    frame, _, quality = module.extract()
    row = frame[frame["source_id"].eq("longpoint-forum-apify-targeted-2026-11-17")].iloc[0]
    assert row["report_date"] == "2013-07-14"
    assert row["species"] == "walleye"
    assert not bool(row["caught"])
    assert row["effort_minutes"] == 210
    assert row["lake_id"] == "lake-erie"
    assert quality["no_catch_candidates"] == 1


def test_jina_first_post_stops_before_replies() -> None:
    module = _tool("extract_longpoint_reports")
    markdown = """
Markdown Content:
[member](https://longpoint.on.ca/members/test.42/)
* [#1](https://longpoint.on.ca/threads/report.1/post-100)
Caught two walleye.
* [](https://longpoint.on.ca/threads/report.1/post-101)
* [#2](https://longpoint.on.ca/threads/report.1/post-101)
Reply says no fish.
"""
    contributor, body = module.jina_first_post(markdown)
    assert contributor
    assert "Caught two walleye" in body
    assert "Reply says no fish" not in body


def test_bounded_jina_capture_adds_only_filtered_walleye_outcomes() -> None:
    module = _tool("extract_longpoint_reports")
    frame, _, quality = module.extract()
    jina = frame[frame["source_id"].eq("longpoint-forum-jina-2026-11-18")]
    eligible = jina[
        jina["species"].eq("walleye")
        & jina["caught"].notna()
        & jina["report_date"].notna()
        & jina["lake_id"].notna()
    ]
    assert len(eligible) == 6
    assert eligible["caught"].astype(bool).all()
    assert quality["broad_technically_usable_rows"] == 10


def test_wdfw_snapshot_separates_complete_from_right_censored_trips() -> None:
    module = _tool("extract_wdfw_walleye")
    frame, rejected, quality = module.extract()
    complete = frame[frame["trip_status"].str.casefold().eq("complete")].iloc[0]
    incomplete = frame[frame["trip_status"].str.casefold().ne("complete")].iloc[0]
    assert not bool(complete["caught"])
    assert complete["effort_minutes"] == 130
    assert bool(complete["broad_transfer_candidate"])
    assert "incomplete_trip_is_right_censored" in incomplete["exclusion_reasons"]
    assert len(rejected) == 2
    assert quality["training_eligible_rows"] == 0


def test_quinte_review_ledger_admits_only_independent_outcomes() -> None:
    module = _tool("extract_quinte_forum")
    extracted, rejected, broad, quality = module.extract()
    assert len(extracted) == len(broad) == 8
    assert int(extracted["caught"].sum()) == 6
    assert int((~extracted["caught"]).sum()) == 2
    assert int(extracted["effort_minutes"].notna().sum()) == 2
    assert set(broad["lake_id"]) == {"bay-of-quinte"}
    assert len(rejected) == 158
    assert quality["unique_contributors"] == 6


def test_combined_bootstrap_snapshot_stays_blocked_below_training_gates() -> None:
    module = _tool("prepare_bootstrap_snapshot")
    report = module.build()
    assert report["decision"] == "NO_GO"
    assert report["valid_rows"] == 18
    assert report["environment_complete_rows"] == 18
    assert set(report["lakes"]) == {"lake-erie", "bay-of-quinte"}
    assert report["model_trained"] is False
    assert report["model_promoted"] is False
    assert report["gates"]["production_weather_approved"] is False
    assert "Evaluation weather is not licensed for production use" in report["blockers"]
