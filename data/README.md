# BiteCast public data snapshot

This directory contains the public-data research snapshot acquired on 2026-11-14. Raw artifacts are
immutable inputs. Derived files retain a `source_id` that resolves through `source-manifest.csv`.

## Rebuild derived files

From the repository root:

```bash
ml/.venv/bin/python ml/tools/prepare_public_data_snapshot.py
```

The workbook sheets in `extracted/michigan-*.csv` were exported verbatim from the downloaded Michigan
DNR workbooks. The rebuild script consumes those exports but never treats aggregate report rows as
independent fishing outcomes.

## Safety rules

- `raw/` is source evidence; do not edit it.
- `extracted/` preserves selected source records before eligibility filtering.
- `normalized/` contains typed, filtered feature inputs.
- `rejected/` explains records and sources excluded from modeling.
- A technically readable source is not automatically approved for commercial production use.
- Do not train a supervised catch model unless `quality-report.json` reports eligible outcome rows and the
  source licence, effort, timestamps, leakage, duplicates, geographic coverage, and temporal coverage pass
  review.

The current decision is documented in `data-viability-report.md`: eighteen observations are admitted as broad
trip/day candidates across Lake Erie and Bay of Quinte (fifteen catch and three no-catch). All eighteen have
evaluation-only period-matched weather, but the sample is still below the row and class gates, so no
challenger was trained. No forum report is eligible for the precise hourly family.

## One-time Long Point forum snapshot

The `raw/reports/longpoint-apify-2026-11-15-*.jsonl` files preserve a bounded Apify crawl of the public
Long Point fishing-report forum. The crawl captured recent forum index pages 1-5, archive-tail index pages
1346-1348, and the thread pages discovered from them. It is a starter research snapshot, not a complete
archive.

Rebuild its conservative structured extract with:

```bash
ml/.venv/bin/python ml/tools/extract_longpoint_reports.py
```

The outputs are `extracted/longpoint-forum-reports.csv`,
`rejected/longpoint-forum-report-rejections.csv`, and `longpoint-forum-quality-report.json`. A second,
targeted Apify capture preserves one explicit Lake Erie no-catch report with 3.5 hours of effort. The project
owner authorized technically usable rows for BiteCast's separate `trip_broad` bootstrap family. A bounded,
paced Jina Reader pass added 45 stratified index pages and 100 filtered candidate threads; it is not a full
archive and page presence is never treated as an outcome. Run `prepare-longpoint-broad --authorize-source`
to make the source decision explicit; the current result is nine day-precision Lake Erie catch reports plus
one no-catch report in
`extracted/longpoint-broad-observations.parquet`. They remain excluded from hourly training and are not
enough to train a broad challenger. The extractor stops at the
first detectable post boundary so replies are not silently converted into labels for the opening report.

## Quinte Fishing Discourse snapshot

`raw/reports/quintefishing-discourse-2026-11-18-topics.jsonl` contains the 51 public Fishing-General
topics available through the forum's Discourse JSON API on the snapshot date. Discourse provides stable
post IDs, authors, and timestamps, but a reply still becomes evidence only when it independently describes
a completed walleye trip. The explicit decisions live in
`review/quintefishing-outcome-decisions.csv`; eight of 166 posts are admitted and 158 remain rejected.

Rebuild those outputs with:

```bash
PYTHONPATH=ml/src ml/.venv/bin/python ml/tools/extract_quinte_forum.py
```

## WDFW transfer-reference snapshot

The official Washington State creel API contained two walleye-target interviews. Both recorded no walleye;
one was complete and one was incomplete/right-censored. They are preserved in
`extracted/wdfw-walleye-interviews.csv` for source assessment only. They are not mixed into the launch-lake
training set because the source is outside the target geography and its dataset-specific commercial reuse
status still requires review.

## Bootstrap readiness

Run `PYTHONPATH=ml/src ml/.venv/bin/python ml/tools/prepare_bootstrap_snapshot.py` to normalize the bounded
outcome-weather files, enrich the eighteen reviewed observations, validate the contract, and regenerate
`bootstrap-readiness-report.json`. The script records a `NO_GO` decision and never trains or promotes a
model when the readiness gates fail.
