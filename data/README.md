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

The current decision is documented in `data-viability-report.md`: three reports are admitted as broad
trip/day candidates, but the sample has no no-catch rows and no matching 2026 weather, so it cannot yet
train a challenger. No report is eligible for the precise hourly family.

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
`rejected/longpoint-forum-report-rejections.csv`, and `longpoint-forum-quality-report.json`. The project
owner authorized technically usable rows for BiteCast's separate `trip_broad` bootstrap family. Run
`prepare-longpoint-broad --authorize-source` to make that decision explicit; the current result is three
day-precision Lake Erie catch reports in `extracted/longpoint-broad-observations.parquet`. They remain
excluded from hourly training and are not enough to train a broad challenger. The extractor stops at the
first detectable post boundary so replies are not silently converted into labels for the opening report.
