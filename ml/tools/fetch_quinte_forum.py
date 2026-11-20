"""Capture a bounded public Discourse snapshot from Quinte Fishing."""

from __future__ import annotations

import json
import time
from datetime import UTC, datetime
from pathlib import Path

import httpx

REPO_ROOT = Path(__file__).resolve().parents[2]
OUTPUT = REPO_ROOT / "data/raw/reports/quintefishing-discourse-2026-11-18-topics.jsonl"
BASE_URL = "https://quintefishing.com"
CATEGORY_PATH = "/c/general/4.json"
MAX_CATEGORY_PAGES = 10
REQUEST_DELAY_SECONDS = 0.15


def fetch() -> dict:
    if OUTPUT.exists():
        raise FileExistsError(f"Raw snapshot already exists: {OUTPUT}")
    topic_ids: list[int] = []
    with httpx.Client(
        base_url=BASE_URL,
        headers={"User-Agent": "BiteCast public-data research/1.0"},
        follow_redirects=True,
        timeout=30,
    ) as client:
        for page in range(MAX_CATEGORY_PAGES):
            response = client.get(CATEGORY_PATH, params={"page": page})
            response.raise_for_status()
            listing = response.json()
            topics = listing.get("topic_list", {}).get("topics", [])
            if not topics:
                break
            topic_ids.extend(int(topic["id"]) for topic in topics)
            if not listing.get("topic_list", {}).get("more_topics_url"):
                break
            time.sleep(REQUEST_DELAY_SECONDS)

        unique_ids = list(dict.fromkeys(topic_ids))
        captured_at = datetime.now(UTC).isoformat()
        records: list[dict] = []
        for topic_id in unique_ids:
            response = client.get(f"/t/{topic_id}.json")
            response.raise_for_status()
            records.append(
                {
                    "source_url": str(response.url).removesuffix(".json"),
                    "captured_at": captured_at,
                    "http_status_code": response.status_code,
                    "topic": response.json(),
                }
            )
            time.sleep(REQUEST_DELAY_SECONDS)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    temporary = OUTPUT.with_suffix(".tmp")
    with temporary.open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n")
    temporary.replace(OUTPUT)
    return {
        "source": BASE_URL,
        "category": CATEGORY_PATH,
        "topics_discovered": len(topic_ids),
        "unique_topics_captured": len(records),
        "output": str(OUTPUT.relative_to(REPO_ROOT)),
    }


def main() -> None:
    print(json.dumps(fetch(), indent=2))


if __name__ == "__main__":
    main()
