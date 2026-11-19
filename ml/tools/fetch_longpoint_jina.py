"""Fetch a bounded, stratified Long Point forum snapshot through Jina Reader."""

from __future__ import annotations

import argparse
import json
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import unquote, urlsplit, urlunsplit

import httpx

REPO_ROOT = Path(__file__).resolve().parents[2]
RAW_ROOT = REPO_ROOT / "data/raw/reports"
INDEX_OUTPUT = RAW_ROOT / "longpoint-jina-index-2026-11-18.jsonl"
THREAD_OUTPUT = RAW_ROOT / "longpoint-jina-threads-2026-11-18.jsonl"
READER_BASE = "https://r.jina.ai/http://longpoint.on.ca"
INDEX_PAGES = (
    list(range(6, 16))
    + list(range(100, 105))
    + list(range(200, 205))
    + list(range(300, 305))
    + list(range(500, 505))
    + list(range(700, 705))
    + list(range(900, 905))
    + list(range(1100, 1105))
)
MAX_WORKERS = 4
THREAD_WORKERS = 1
MAX_RETRIES = 6
MAX_CANDIDATE_THREADS = 250
TITLE_INCLUDE = re.compile(
    r"\b(walleye|pickerel|erie|burwell|bruce|glasgow|erieau|nanticoke|elbow|long point|"
    r"outer bay|maitland|dover|lighthouse|port stanley|central basin|lpb)\b",
    re.I,
)
TITLE_EXCLUDE = re.compile(
    r"\b(off topic|classified|for sale|wanted|weather|windfinder|launch ramp|boat repair|"
    r"perch only|bass opener|trout opener)\b",
    re.I,
)


def _fetch(path: str, request_delay_seconds: float = 0) -> str:
    url = f"{READER_BASE}{path}"
    for attempt in range(MAX_RETRIES):
        try:
            if request_delay_seconds:
                time.sleep(request_delay_seconds)
            response = httpx.get(
                url,
                headers={"User-Agent": "BiteCast public-data research/1.0"},
                follow_redirects=True,
                timeout=60,
            )
            response.raise_for_status()
            if "Markdown Content:" not in response.text:
                raise ValueError("Reader response does not contain Markdown Content")
            return response.text
        except (httpx.HTTPError, ValueError) as error:
            if attempt + 1 == MAX_RETRIES:
                raise
            retry_after = None
            if isinstance(error, httpx.HTTPStatusError):
                retry_after = error.response.headers.get("retry-after")
            delay = float(retry_after) if retry_after and retry_after.isdigit() else 5 * (attempt + 1)
            time.sleep(min(delay, 60))
    raise RuntimeError("unreachable")


def _write_jsonl(path: Path, rows: list[dict]) -> None:
    if path.exists():
        raise FileExistsError(f"Raw snapshot already exists: {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    with temporary.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")
    temporary.replace(path)


def fetch_indexes() -> dict:
    captured_at = datetime.now(UTC).isoformat()
    records: list[dict] = []
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {
            executor.submit(_fetch, f"/forums/fishing-reports/page-{page}"): page
            for page in INDEX_PAGES
        }
        for future in as_completed(futures):
            page = futures[future]
            records.append(
                {
                    "page": page,
                    "source_url": f"https://longpoint.on.ca/forums/fishing-reports/page-{page}",
                    "captured_at": captured_at,
                    "markdown": future.result(),
                }
            )
    records.sort(key=lambda row: row["page"])
    _write_jsonl(INDEX_OUTPUT, records)
    candidates = discover_candidates(records)
    return {
        "index_pages": len(records),
        "candidate_threads": len(candidates),
        "index_output": str(INDEX_OUTPUT.relative_to(REPO_ROOT)),
    }


def _canonical_thread_url(raw: str) -> str:
    parts = urlsplit(raw)
    path = re.sub(r"/(latest|page-\d+)/?$", "/", parts.path)
    return urlunsplit(("https", "longpoint.on.ca", path, "", ""))


def discover_candidates(records: list[dict] | None = None) -> dict[str, str]:
    if records is None:
        records = [json.loads(line) for line in INDEX_OUTPUT.read_text().splitlines() if line]
    candidates: dict[str, str] = {}
    link_pattern = re.compile(
        r"\[([^\]]+)\]\((https://longpoint\.on\.ca/threads/[^)]+)\)", re.I
    )
    for record in records:
        for title, raw_url in link_pattern.findall(record["markdown"]):
            clean_title = re.sub(r"\s+", " ", unquote(title)).strip()
            if not TITLE_INCLUDE.search(clean_title) or TITLE_EXCLUDE.search(clean_title):
                continue
            candidates.setdefault(_canonical_thread_url(raw_url), clean_title)
    return candidates


def fetch_threads(limit: int) -> dict:
    if not INDEX_OUTPUT.exists():
        raise FileNotFoundError(f"Fetch indexes first: {INDEX_OUTPUT}")
    candidates = discover_candidates()
    if not 1 <= limit <= MAX_CANDIDATE_THREADS:
        raise ValueError(f"limit must be between 1 and {MAX_CANDIDATE_THREADS}")
    selected = dict(list(candidates.items())[:limit])
    captured_at = datetime.now(UTC).isoformat()
    records: list[dict] = []
    with ThreadPoolExecutor(max_workers=THREAD_WORKERS) as executor:
        futures = {
            executor.submit(_fetch, urlsplit(url).path, 1.5): (url, title)
            for url, title in selected.items()
        }
        for future in as_completed(futures):
            url, title = futures[future]
            records.append(
                {
                    "source_url": url,
                    "title": title,
                    "captured_at": captured_at,
                    "markdown": future.result(),
                }
            )
    records.sort(key=lambda row: row["source_url"])
    _write_jsonl(THREAD_OUTPUT, records)
    return {
        "candidate_threads_discovered": len(candidates),
        "candidate_threads_selected": len(selected),
        "threads_captured": len(records),
        "thread_output": str(THREAD_OUTPUT.relative_to(REPO_ROOT)),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=("indexes", "threads", "all"), default="indexes", nargs="?")
    parser.add_argument("--limit", type=int, default=200)
    args = parser.parse_args()
    if args.mode in {"indexes", "all"}:
        print(json.dumps(fetch_indexes(), indent=2))
    if args.mode in {"threads", "all"}:
        print(json.dumps(fetch_threads(args.limit), indent=2))


if __name__ == "__main__":
    main()
