"""Extract conservative, research-only fishing observations from one Apify forum snapshot."""

from __future__ import annotations

import csv
import glob
import hashlib
import json
import re
from datetime import date, datetime, timedelta
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[2]
RAW_ROOT = REPO_ROOT / "data/raw/reports"
EXTRACTED_ROOT = REPO_ROOT / "data/extracted"
REJECTED_ROOT = REPO_ROOT / "data/rejected"
SNAPSHOT_DATE = date(2026, 11, 15)

LOCATIONS = {
    "nanticoke": "Nanticoke",
    "long point": "Long Point Bay",
    "lpb": "Long Point Bay",
    "outer bay": "Long Point Outer Bay",
    "inner bay": "Long Point Inner Bay",
    "port glasgow": "Port Glasgow",
    "glasgow": "Port Glasgow",
    "port burwell": "Port Burwell",
    "burwell": "Port Burwell",
    "port dover": "Port Dover",
    "dover": "Port Dover",
    "erieau": "Erieau",
    "elbow": "Long Point Elbow",
    "bay of quinte": "Bay of Quinte",
    "boq": "Bay of Quinte",
}
SPECIES = {
    "walleye": "walleye",
    "pickerel": "walleye",
    "walters": "walleye",
    "yellow perch": "yellow_perch",
    "perch": "yellow_perch",
    "pike": "northern_pike",
    "smallmouth": "smallmouth_bass",
    "bass": "bass_unspecified",
    "salmon": "salmon_unspecified",
    "trout": "trout_unspecified",
}
METHODS = {
    "troll": "troll",
    "dipsy": "troll",
    "dipsey": "troll",
    "flatline": "troll",
    "jig": "jig",
    "drift": "drift",
    "cast": "cast",
    "harness": "troll",
}
ERIE_LOCATIONS = {
    "Nanticoke",
    "Long Point Bay",
    "Long Point Outer Bay",
    "Long Point Inner Bay",
    "Port Glasgow",
    "Port Burwell",
    "Port Dover",
    "Erieau",
    "Long Point Elbow",
}


def load_jsonl(pattern: str) -> list[dict]:
    rows: list[dict] = []
    for path in sorted(glob.glob(str(RAW_ROOT / pattern))):
        with open(path, encoding="utf-8") as handle:
            rows.extend(json.loads(line) for line in handle if line.strip())
    return rows


def canonical_url(raw: str) -> str:
    parts = urlsplit(raw)
    path = re.sub(r"/(latest|page-\d+)/?$", "/", parts.path)
    return urlunsplit(("https", "www.longpoint.on.ca", path, "", ""))


def parse_index_dates(index_pages: list[dict]) -> dict[str, str]:
    dates: dict[str, str] = {}
    pattern = re.compile(
        r"\]\((https?://(?:www\.)?longpoint\.on\.ca/threads/[^)]+)\)\n\n"
        r"(?:\*\s+\[[^\]]+\]\([^)]+\)\n)?\*\s+\[([^\]]+)\]\([^)]+\)",
        re.I,
    )
    for page in index_pages:
        for url, value in pattern.findall(page.get("markdown") or ""):
            parsed = parse_forum_date(value.strip())
            if parsed:
                dates.setdefault(canonical_url(url), parsed.isoformat())
    return dates


def parse_forum_date(value: str) -> date | None:
    lowered = value.casefold()
    if lowered.startswith("today"):
        return SNAPSHOT_DATE
    if lowered.startswith("yesterday"):
        return SNAPSHOT_DATE - timedelta(days=1)
    weekdays = {
        "monday": 0,
        "tuesday": 1,
        "wednesday": 2,
        "thursday": 3,
        "friday": 4,
        "saturday": 5,
        "sunday": 6,
    }
    for name, weekday in weekdays.items():
        if lowered.startswith(name):
            return SNAPSHOT_DATE - timedelta(days=(SNAPSHOT_DATE.weekday() - weekday) % 7)
    for fmt in ("%b %d, %Y", "%B %d, %Y", "%b %d, %y", "%B %d, %y"):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    return None


def date_from_title(title: str) -> date | None:
    month = re.search(
        r"\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|"
        r"aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+"
        r"(\d{1,2})(?:st|nd|rd|th)?(?:[,/\s]+(20\d{2}|\d{2,3}))?\b",
        title,
        re.I,
    )
    if month:
        raw_year = month.group(3)
        year = SNAPSHOT_DATE.year if not raw_year else int(raw_year)
        if year < 100:
            year += 2000
        elif year < 1000:
            year += 2000
        for fmt in ("%b", "%B"):
            try:
                month_number = datetime.strptime(month.group(1)[:3], fmt).month
                return date(year, month_number, int(month.group(2)))
            except ValueError:
                continue
    numeric = re.search(r"\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2}|\d{2})\b", title)
    if numeric:
        year = int(numeric.group(3))
        return date(year + 2000 if year < 100 else year, int(numeric.group(1)), int(numeric.group(2)))
    return None


def first_post(markdown: str) -> tuple[str | None, str]:
    if "Markdown Content:" in markdown:
        return jina_first_post(markdown)
    avatar = re.compile(
        r"\[!\[[^\]]*\]\(https://cdn\.longpoint\.on\.ca/data/avatars/[^)]+\)\]"
        r"\(https://www\.longpoint\.on\.ca/members/([^.)/]+)\.(\d+)/\)"
    )
    matches = list(avatar.finditer(markdown))
    heading_end = markdown.find("\n", markdown.find("# "))
    if heading_end < 0:
        return None, ""

    def clean_body(body: str) -> str:
        # Apify's Markdown has no stable post container metadata, but XenForo
        # inserts a whitespace-only block between posts. Stop there rather than
        # allowing replies to become labels or features.
        body = re.split(r"\n\n[ \t]+\n\n", body, maxsplit=1)[0]
        body = re.split(r"\n#### \[", body, maxsplit=1)[0]
        body = re.sub(r"\[!\[[^\]]*\]\([^)]+\)\]\([^)]+\)", " ", body)
        body = re.sub(r"!\[[^\]]*\]\([^)]+\)", " ", body)
        body = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", body)
        return re.sub(r"\s+", " ", body).strip()

    # XenForo's rendered Markdown sometimes omits the thread author's avatar while
    # retaining avatars for later replies. In that case the content between the H1
    # and first avatar is the safest available opening-post boundary.
    if matches:
        pre_avatar = clean_body(markdown[heading_end : matches[0].start()])
        if pre_avatar:
            return None, pre_avatar

    if not matches:
        reply_heading = markdown.find("\n#### [", heading_end)
        body = markdown[heading_end : reply_heading if reply_heading >= 0 else len(markdown)]
        return None, clean_body(body)
    start = matches[0].end()
    end_candidates = [len(markdown)]
    if len(matches) > 1:
        end_candidates.append(matches[1].start())
    reply_heading = markdown.find("\n#### [", start)
    if reply_heading >= 0:
        end_candidates.append(reply_heading)
    end = min(end_candidates)
    body = clean_body(markdown[start:end])
    contributor_hash = hashlib.sha256(f"longpoint-public:{matches[0].group(2)}".encode()).hexdigest()
    return contributor_hash, body


def jina_first_post(markdown: str) -> tuple[str | None, str]:
    """Extract only XenForo post #1 from a Jina Reader rendering."""
    marker = re.search(r"\[#1\]\([^)]*/post-\d+\)", markdown)
    if marker is None:
        return None, ""
    tail = markdown[marker.end() :]
    next_post = re.search(r"\n\*\s+\[\]\([^\n)]*/post-\d+\)", tail)
    body = tail[: next_post.start() if next_post else len(tail)]
    body = re.sub(r"\n#### Attachments.*", " ", body, flags=re.S)
    body = re.sub(r"\[!\[[^\]]*\]\([^)]+\)\]\([^)]+\)", " ", body)
    body = re.sub(r"!\[[^\]]*\]\([^)]+\)", " ", body)
    body = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", body)
    body = re.sub(r"\s+", " ", body).strip()
    prefix = markdown[: marker.start()]
    members = re.findall(r"longpoint\.on\.ca/members/[^.)/]+\.(\d+)/", prefix, re.I)
    contributor_hash = (
        hashlib.sha256(f"longpoint-public:{members[-1]}".encode()).hexdigest()
        if members
        else None
    )
    return contributor_hash, body


def first_match(text: str, mapping: dict[str, str]) -> str | None:
    lowered = text.casefold()
    return next((value for key, value in mapping.items() if key in lowered), None)


def infer_outcome(text: str) -> tuple[bool | None, int | None, str]:
    lowered = text.casefold()
    negative = re.search(
        r"\b(no fish|no catch|caught nothing|didn'?t catch|skunked|not a sniff|zero fish)\b", lowered
    )
    count_patterns = (
        r"\b(?:caught|landed|got|boated|kept|boxed|released)\s+(?:around\s+|about\s+)?(\d{1,2})\b",
        r"\b(\d{1,2})\s+(?:keepers?|walleye|pickerel|fish)\b",
        r"\b(\d{1,2})\s*/\s*\d{1,2}\b",
    )
    counts = [int(match.group(1)) for pattern in count_patterns for match in re.finditer(pattern, lowered)]
    counts = [value for value in counts if 0 <= value <= 99]
    if counts:
        return True, max(counts), "explicit_count"
    positive = re.search(
        r"\b(caught|landed|boated|limited out|got our limit|fish on|double header)\b", lowered
    )
    if negative and not positive:
        return False, 0, "explicit_negative"
    if positive:
        return True, None, "positive_without_count"
    return None, None, "outcome_unknown"


def infer_species_outcome(
    text: str,
    species: str | None,
    title_names_species: bool,
) -> tuple[bool | None, int | None, str]:
    """Prefer outcome language tied to the selected species over mixed-trip wording."""
    if species != "walleye":
        return infer_outcome(text)
    lowered = text.casefold()
    aliases = r"(?:walleye|pickerel|eyes?)"
    count_patterns = (
        rf"\b(?:caught|landed|boated|kept|boxed|released|managed|ended the day with)\s+"
        rf"(?:around\s+|about\s+)?(\d{{1,2}})(?:\s+\w+){{0,3}}\s+{aliases}\b",
        rf"\b(\d{{1,2}})\s+{aliases}\b",
    )
    for pattern in count_patterns:
        for match in re.finditer(pattern, lowered):
            context = lowered[max(0, match.start() - 40) : match.end() + 20]
            if "this year" in context or "all total" in context:
                continue
            return True, int(match.group(1)), "explicit_species_count"
    positive = re.search(
        rf"(?:\b(?:caught|landed|boated|kept|released|iced|fighting)\b[^.!?]{{0,90}}\b{aliases}\b|"
        rf"\b{aliases}\b[^.!?]{{0,90}}\b(?:caught|landed|boated|kept|released|iced)\b|"
        rf"\b\d{{1,2}}(?:\.\d+)?(?:\"|\s*inch(?:es)?)\s+{aliases}\b)",
        lowered,
    )
    if positive:
        return True, None, "explicit_species_positive"
    negative = re.search(
        rf"\b(?:no|zero)\s+{aliases}\b|\b(?:didn'?t|did not|never)\s+catch[^.!?]{{0,50}}\b{aliases}\b",
        lowered,
    )
    if negative:
        return False, 0, "explicit_species_negative"
    if title_names_species:
        return infer_outcome(text)
    return None, None, "species_outcome_unknown"


def infer_effort_minutes(text: str) -> tuple[int | None, str]:
    lowered = text.casefold()
    duration = re.search(
        r"\b(?:for|in|under|about|around|fished(?:\s+for)?)\s+"
        r"(\d+(?:\.\d+)?)\s*(hours?|hrs?)\b",
        lowered,
    )
    if duration:
        return round(float(duration.group(1)) * 60), "explicit_duration"
    times = re.findall(r"\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b", lowered)
    if len(times) >= 2:
        minutes = []
        for hour, minute, meridiem in times[:2]:
            value = int(hour) % 12 * 60 + int(minute or 0) + (720 if meridiem == "pm" else 0)
            minutes.append(value)
        difference = minutes[1] - minutes[0]
        if difference <= 0:
            difference += 1440
        if 0 < difference <= 960:
            return difference, "inferred_from_times"
    return None, "effort_unknown"


def numeric_feature(text: str, pattern: str, conversion: float = 1.0) -> float | None:
    match = re.search(pattern, text.casefold())
    return round(float(match.group(1)) * conversion, 3) if match else None


def extract() -> tuple[pd.DataFrame, pd.DataFrame, dict]:
    threads = load_jsonl("longpoint-apify-2026-11-15-part-*.jsonl")
    targeted = load_jsonl("longpoint-apify-targeted-*.jsonl")
    threads.extend(targeted)
    jina_threads = load_jsonl("longpoint-jina-threads-*.jsonl")
    for row in jina_threads:
        row.setdefault("source_id", "longpoint-forum-jina-2026-11-18")
    threads.extend(jina_threads)
    indexes = load_jsonl("longpoint-apify-2026-11-15-index-pages.jsonl")
    indexes.extend(load_jsonl("longpoint-jina-index-*.jsonl"))
    index_dates = parse_index_dates(indexes)
    unique: dict[str, dict] = {}
    for row in threads:
        url = canonical_url(row["source_url"])
        current = unique.get(url)
        raw_path = urlsplit(row["source_url"]).path
        row["_is_primary_page"] = not bool(re.search(r"/(latest|page-\d+)/?$", raw_path))
        current_is_primary = bool(current and current.get("_is_primary_page"))
        if current is None or (row["_is_primary_page"] and not current_is_primary):
            unique[url] = row

    accepted = []
    rejected = []
    for url, source in sorted(unique.items()):
        title = re.sub(r"\s*\|\s*Channel 6-8\s*$", "", source.get("title") or "").strip()
        title = re.sub(r"^Fishing Report\s*-\s*", "", title, flags=re.I)
        contributor_hash, body = first_post(source.get("markdown") or "")
        if source.get("first_post_text"):
            body = re.sub(r"\s+", " ", str(source["first_post_text"])).strip()
        if source.get("member_id"):
            contributor_hash = hashlib.sha256(
                f"longpoint-public:{source['member_id']}".encode()
            ).hexdigest()
        combined = f"{title} {body}"
        # Prefer the thread title when it names a species; a report may mention
        # incidental species later in the post.
        title_species = first_match(title, SPECIES)
        species = title_species or first_match(body, SPECIES)
        location = first_match(combined, LOCATIONS)
        caught, count, outcome_basis = infer_species_outcome(body, species, title_species == species)
        effort, effort_basis = infer_effort_minutes(body)
        report_date = source.get("published_date") or index_dates.get(url) or (
            inferred.isoformat() if (inferred := date_from_title(title)) else None
        )
        method = first_match(body, METHODS)
        is_off_topic = title.casefold().startswith("off topic")
        reasons = []
        if is_off_topic:
            reasons.append("off_topic_prefix")
        if not body:
            reasons.append("missing_first_post")
        if not species:
            reasons.append("species_unknown")
        if not report_date:
            reasons.append("date_unknown")
        if caught is None:
            reasons.append("outcome_unknown")
        if effort is None:
            reasons.append("effort_unknown")

        lowered = combined.casefold()
        if location == "Bay of Quinte":
            lake_id = "bay-of-quinte"
        elif location in ERIE_LOCATIONS or "lake erie" in lowered:
            lake_id = "lake-erie"
        else:
            lake_id = None

        row = {
            "record_id": hashlib.sha256(url.encode()).hexdigest(),
            "source_id": source.get("source_id") or "longpoint-forum-apify-2026-11-15",
            "source_url": url,
            "title": title,
            "contributor_hash": contributor_hash,
            "report_date": report_date,
            "lake_id": lake_id,
            "general_location": location,
            "species": species,
            "caught": caught,
            "catch_count": count,
            "outcome_basis": outcome_basis,
            "effort_minutes": effort,
            "effort_basis": effort_basis,
            "method": method,
            "fishing_depth_m": numeric_feature(
                body, r"\b(?:down|running at)\s+(\d+(?:\.\d+)?)\s*(?:ft|feet)\b", 0.3048
            ),
            "water_depth_m": numeric_feature(body, r"\b(\d+(?:\.\d+)?)\s*(?:fow|feet of water)\b", 0.3048),
            "water_temp_c": numeric_feature(
                body, r"\b(?:water temp(?:erature)?(?: was| of)?|surface)\s*(\d+(?:\.\d+)?)\s*°?f\b", 1.0
            ),
            "first_post_text": body,
            "consent_status": "not_obtained",
            "commercial_use_status": "not_verified",
            "training_eligible": False,
            "research_only": True,
            "quality_flags": "|".join(reasons),
        }
        if row["water_temp_c"] is not None:
            row["water_temp_c"] = round((row["water_temp_c"] - 32) * 5 / 9, 2)
        accepted.append(row)
        if reasons:
            rejected.append(
                {
                    "record_id": row["record_id"],
                    "source_url": url,
                    "reasons": "|".join(reasons),
                    "excluded_from_training": True,
                }
            )

    frame = pd.DataFrame(accepted)
    rejected_frame = pd.DataFrame(rejected)
    candidate = frame[
        frame["species"].eq("walleye")
        & frame["caught"].notna()
        & frame["effort_minutes"].notna()
        & frame["report_date"].notna()
        & frame["lake_id"].notna()
        & ~frame["quality_flags"].str.contains("off_topic_prefix")
    ]
    broad_candidate = frame[
        frame["species"].eq("walleye")
        & frame["caught"].notna()
        & frame["report_date"].notna()
        & frame["lake_id"].notna()
        & ~frame["quality_flags"].str.contains("off_topic_prefix")
    ]
    dated = pd.to_datetime(frame["report_date"], errors="coerce")
    quality = {
        "snapshot_date": SNAPSHOT_DATE.isoformat(),
        "apify_run_id": "KVAUbIfzkaRlQMzzS",
        "apify_dataset_id": "wmZnm7UZ0Z0KzXfMh",
        "raw_dataset_items": len(threads) + len(indexes),
        "raw_thread_pages": len(threads),
        "unique_threads": len(frame),
        "off_topic_threads": int(frame["quality_flags"].str.contains("off_topic_prefix").sum()),
        "walleye_threads": int(frame["species"].eq("walleye").sum()),
        "known_outcome_threads": int(frame["caught"].notna().sum()),
        "known_effort_threads": int(frame["effort_minutes"].notna().sum()),
        "dated_threads": int(dated.notna().sum()),
        "lake_identified_threads": int(frame["lake_id"].notna().sum()),
        "location_identified_threads": int(frame["general_location"].notna().sum()),
        "method_identified_threads": int(frame["method"].notna().sum()),
        "depth_identified_threads": int(frame["fishing_depth_m"].notna().sum()),
        "unique_hashed_contributors": int(frame["contributor_hash"].nunique()),
        "earliest_report_date": dated.min().date().isoformat() if dated.notna().any() else None,
        "latest_report_date": dated.max().date().isoformat() if dated.notna().any() else None,
        "duplicate_thread_pages_removed": len(threads) - len(frame),
        "complete_walleye_candidates": len(candidate),
        "catch_candidates": int(candidate["caught"].eq(True).sum()),
        "no_catch_candidates": int(candidate["caught"].eq(False).sum()),
        "training_eligible_rows": 0,
        "broad_technically_usable_rows": len(broad_candidate),
        "broad_authorized_rows": len(broad_candidate),
        "broad_training_ready_rows": 0,
        "capture_scope": (
            "original forum sample plus a bounded 45-page stratified index snapshot and "
            "100 candidate thread pages; not a complete archive"
        ),
        "training_blockers": [
            "No records contain exact hourly outcome labels required by the hourly model",
            "Broad observations remain below the 100-row training threshold",
            "Broad records still require period-matched historical weather",
            "Forum selection/reporting bias and regex fields require review",
        ],
    }
    return frame, rejected_frame, quality


def main() -> None:
    EXTRACTED_ROOT.mkdir(parents=True, exist_ok=True)
    REJECTED_ROOT.mkdir(parents=True, exist_ok=True)
    frame, rejected, quality = extract()
    frame.to_csv(EXTRACTED_ROOT / "longpoint-forum-reports.csv", index=False, quoting=csv.QUOTE_MINIMAL)
    rejected.to_csv(REJECTED_ROOT / "longpoint-forum-report-rejections.csv", index=False)
    (REPO_ROOT / "data/longpoint-forum-quality-report.json").write_text(json.dumps(quality, indent=2) + "\n")
    print(json.dumps(quality, indent=2))


if __name__ == "__main__":
    main()
