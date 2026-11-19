"""Apply an explicit review ledger to the bounded Quinte Fishing snapshot."""

from __future__ import annotations

import csv
import hashlib
import json
import re
from html.parser import HTMLParser
from pathlib import Path

import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[2]
RAW_PATH = REPO_ROOT / "data/raw/reports/quintefishing-discourse-2026-11-18-topics.jsonl"
REVIEW_PATH = REPO_ROOT / "data/review/quintefishing-outcome-decisions.csv"
EXTRACTED_ROOT = REPO_ROOT / "data/extracted"
REJECTED_ROOT = REPO_ROOT / "data/rejected"


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []

    def handle_data(self, data: str) -> None:
        self.parts.append(data)

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "img":
            alt = dict(attrs).get("alt")
            if alt:
                self.parts.append(alt)


def _plain_text(value: str) -> str:
    parser = _TextExtractor()
    parser.feed(value or "")
    return re.sub(r"\s+", " ", " ".join(parser.parts)).strip()


def _raw_posts() -> dict[tuple[int, int], dict]:
    posts: dict[tuple[int, int], dict] = {}
    with RAW_PATH.open(encoding="utf-8") as handle:
        for line in handle:
            record = json.loads(line)
            topic = record["topic"]
            for post in topic.get("post_stream", {}).get("posts", []):
                key = (int(topic["id"]), int(post["post_number"]))
                posts[key] = {
                    "topic_id": key[0],
                    "post_number": key[1],
                    "topic_title": topic["title"],
                    "source_url": f"https://quintefishing.com/t/{topic['slug']}/{topic['id']}/{key[1]}",
                    "created_at": post["created_at"],
                    "user_id": post.get("user_id"),
                    "post_text": _plain_text(post.get("cooked") or ""),
                }
    return posts


def extract() -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, dict]:
    posts = _raw_posts()
    review = pd.read_csv(REVIEW_PATH, keep_default_na=False)
    decisions = {
        (int(row["topic_id"]), int(row["post_number"])): row
        for row in review.to_dict(orient="records")
    }
    missing = sorted(set(decisions) - set(posts))
    if missing:
        raise ValueError(f"Reviewed posts are absent from the immutable snapshot: {missing}")

    extracted: list[dict] = []
    broad: list[dict] = []
    rejected: list[dict] = []
    for key, post in sorted(posts.items()):
        decision = decisions.get(key)
        if decision is None:
            rejected.append(
                {
                    "topic_id": key[0],
                    "post_number": key[1],
                    "source_url": post["source_url"],
                    "reasons": "not_human_approved_as_independent_walleye_outcome",
                    "excluded_from_training": True,
                }
            )
            continue

        caught = str(decision["caught"]).casefold() == "true"
        catch_count = int(decision["catch_count"]) if str(decision["catch_count"]) else None
        effort = int(decision["effort_minutes"]) if str(decision["effort_minutes"]) else None
        contributor_hash = hashlib.sha256(
            f"quintefishing-public:{post['user_id']}".encode()
        ).hexdigest()
        record_id = f"quinte-{key[0]}-{key[1]}"
        extracted.append(
            {
                **post,
                "record_id": record_id,
                "source_id": "quintefishing-discourse-2026-11-18",
                "contributor_hash": contributor_hash,
                "report_start": decision["report_start"],
                "report_end": decision["report_end"],
                "time_precision": decision["time_precision"],
                "time_block": decision["time_block"],
                "lake_id": "bay-of-quinte",
                "general_location": decision["general_location"],
                "species": "walleye",
                "caught": caught,
                "catch_count": catch_count,
                "effort_minutes": effort,
                "season_mode": decision["season_mode"],
                "method": decision["method"],
                "source_quality": float(decision["source_quality"]),
                "review_note": decision["review_note"],
                "training_eligible": True,
            }
        )
        broad.append(
            {
                "observation_id": record_id,
                "trip_id": record_id,
                "anonymous_angler_id": contributor_hash,
                "lake_id": "bay-of-quinte",
                "region": "Eastern Ontario",
                "latitude": 44.16,
                "longitude": -77.18,
                "period_start": decision["report_start"],
                "period_end": decision["report_end"],
                "time_precision": decision["time_precision"],
                "time_block": decision["time_block"],
                "label_granularity": "trip",
                "effort_minutes": effort,
                "effort_known": effort is not None,
                "caught": caught,
                "catch_count": catch_count,
                "species": "walleye",
                "season_mode": decision["season_mode"],
                "method": decision["method"],
                "bait_category": "unknown",
                "fishing_depth_m": None,
                "water_depth_m": None,
                "water_clarity": "stained",
                "lake_area_km2": 320.0,
                "lake_max_depth_m": 30.0,
                "source": "quintefishing-forum-trip-report",
                "source_url": post["source_url"],
                "source_quality": float(decision["source_quality"]),
                "training_authorized": True,
            }
        )

    extracted_frame = pd.DataFrame(extracted)
    rejected_frame = pd.DataFrame(rejected)
    broad_frame = pd.DataFrame(broad)
    quality = {
        "snapshot_date": "2026-11-18",
        "raw_topics": len({key[0] for key in posts}),
        "raw_posts": len(posts),
        "reviewed_outcomes": len(extracted_frame),
        "catch_rows": int(extracted_frame["caught"].sum()),
        "no_catch_rows": int((~extracted_frame["caught"]).sum()),
        "known_effort_rows": int(extracted_frame["effort_minutes"].notna().sum()),
        "open_water_rows": int(extracted_frame["season_mode"].eq("open_water").sum()),
        "ice_rows": int(extracted_frame["season_mode"].eq("ice").sum()),
        "unique_contributors": int(extracted_frame["contributor_hash"].nunique()),
        "unselected_posts": len(rejected_frame),
        "training_ready_rows": 0,
        "decision": "accepted_for_broad_snapshot_pending_environmental_join",
    }
    return extracted_frame, rejected_frame, broad_frame, quality


def main() -> None:
    EXTRACTED_ROOT.mkdir(parents=True, exist_ok=True)
    REJECTED_ROOT.mkdir(parents=True, exist_ok=True)
    extracted, rejected, broad, quality = extract()
    extracted.to_csv(EXTRACTED_ROOT / "quintefishing-reviewed-outcomes.csv", index=False)
    rejected.to_csv(REJECTED_ROOT / "quintefishing-posts.csv", index=False, quoting=csv.QUOTE_MINIMAL)
    broad.to_parquet(EXTRACTED_ROOT / "quintefishing-broad-observations.parquet", index=False)
    (REPO_ROOT / "data/quintefishing-quality-report.json").write_text(
        json.dumps(quality, indent=2) + "\n"
    )
    print(json.dumps(quality, indent=2))


if __name__ == "__main__":
    main()
