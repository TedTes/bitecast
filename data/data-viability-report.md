# Public training-data viability report

Generated: 2026-11-14

## Decision

**NO-GO for challenger training today.** Three Long Point reports pass the broad model's technical and
project-authorization filters, but all three are catch reports and still lack period-matched 2026 weather.
They are preserved as trip/day labels for `trip_broad`; none is expanded into fabricated hourly labels.

## What was acquired and extracted

- 21 raw source artifacts with URLs, owners, licence status, hashes, coverage, and limitations.
- 157,824 hourly historical weather rows: {'bay-of-quinte': 52608, 'lake-erie': 52608, 'lake-ontario': 52608}.
- 235 candidate target-lake Secchi-depth observations; 229
  remain after duplicate and validity filters: {'bay-of-quinte': 17, 'lake-erie': 59, 'lake-ontario': 153}.
- 22,646 daily whole-lake surface-temperature rows: {'lake-erie': 11323, 'lake-ontario': 11323}.
- 221 GLOS platforms within 175 km of a BiteCast lake reference point.
- 9 Lake Erie monthly charter outcome summaries retained as non-training reference data.
- 3 authorized, technically usable Long Point trip/day candidates for the broad family.

## Outcome validation

| Measure | Result |
|---|---:|
| Hourly eligible outcome rows | 0 |
| Broad authorized candidates | 3 |
| Broad catch rows | 3 |
| Broad no-catch rows | 0 |
| Broad training-ready rows | 0 |
| Broad lakes | 1 |
| Broad open-water/ice coverage | Open water only |
| Duplicate eligible outcomes | 0 |
| Invalid eligible outcomes | 0 |

The three broad candidates are real trip/report labels, but they are insufficient to train: CatBoost needs
both catch and no-catch examples, more trips, and joined environment data. The hourly zero remains a
validation result, not a pipeline failure.

## Feature-input validation

- Weather keys are unique by lake and UTC hour; duplicate count: 0.
- Weather pressure and temperature changes are calculated only within each lake series. The first three
  hours per lake are intentionally missing for three-hour deltas.
- Rejected Secchi records: 6 (5 duplicates and
  1 invalid or suspicious values).
- Bay of Quinte has clarity and weather coverage but no separate NOAA whole-lake temperature series.
- NOAA temperatures are explicitly marked as whole-lake daily averages.
- Every normalized row retains a source ID; production eligibility is kept separate from technical usability.

## Required next input

Acquire more broad reports—especially no-catch trips—and period-matched historical weather. Precise
consented BiteCast logs continue feeding both the broad trip aggregate and the separate hourly family.
Training begins only after minimum rows, class balance, leakage, duplication, geographic, temporal, and
environmental checks pass.

## Files

- `source-manifest.csv`: provenance and rights review.
- `lake-crosswalk.csv`: canonical BiteCast lake identities.
- `normalized/historical-weather.parquet`: hourly weather and derived changes.
- `normalized/lake-clarity.parquet`: relevant Secchi observations.
- `normalized/water-conditions.parquet`: daily whole-lake temperature.
- `extracted/aggregate-outcomes-reference.csv`: aggregate reference only; never a label table.
- `extracted/longpoint-broad-observations.parquet`: authorized day-precision broad candidates.
- `rejected/outcome-source-rejections.csv`: outcome exclusions and reasons.
- `rejected/lake-clarity-records.csv`: duplicate, invalid, and suspicious clarity rows.
- `quality-report.json`: machine-readable counts, missingness, duplicates, and gaps.
