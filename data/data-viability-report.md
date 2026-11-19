# Public training-data viability report

Updated: 2026-11-18

## Decision

**NO-GO for challenger training.** Eighteen retained observations pass the broad model's technical and
project-authorization filters: fifteen catch reports and three explicit no-catch reports across Lake Erie and
Bay of Quinte. All eighteen have period-matched evaluation weather, but the evidence remains below the row
and class gates. They are preserved as trip/day labels for `trip_broad`; none is expanded into fabricated
hourly labels.

## What was acquired and extracted

- 38 raw source artifacts with URLs, owners, licence status, hashes, coverage, and limitations.
- 157,824 hourly historical weather rows: {'bay-of-quinte': 52608, 'lake-erie': 52608, 'lake-ontario': 52608}.
- 235 candidate target-lake Secchi-depth observations; 229
  remain after duplicate and validity filters: {'bay-of-quinte': 17, 'lake-erie': 59, 'lake-ontario': 153}.
- 22,646 daily whole-lake surface-temperature rows: {'lake-erie': 11323, 'lake-ontario': 11323}.
- 221 GLOS platforms within 175 km of a BiteCast lake reference point.
- 9 Lake Erie monthly charter outcome summaries retained as non-training reference data.
- 10 authorized, technically usable Long Point trip/day candidates for the broad family. The bounded new
  pass added 6 rows from 100 candidate threads; the other 94 were not admitted as walleye outcome rows.
- 8 reviewed Quinte Fishing trip/day candidates from 166 captured posts.
- 3,552 hourly evaluation-weather rows covering all retained report periods.
- 2 official WDFW walleye-target interviews assessed as transfer evidence; one complete and one
  incomplete/right-censored. Neither enters launch-lake training.

## Outcome validation

| Measure | Result |
|---|---:|
| Hourly eligible outcome rows | 0 |
| Broad authorized candidates | 18 |
| Broad catch rows | 15 |
| Broad no-catch rows | 3 |
| Broad rows with required evaluation weather | 18 |
| Broad training-ready rows | 0 (readiness gates fail) |
| Broad lakes | 2 |
| Broad open-water/ice coverage | 12 open-water / 6 ice |
| Duplicate eligible outcomes | 0 |
| Invalid eligible outcomes | 0 |

The eighteen broad candidates are real trip/report labels and include both classes, but they are insufficient
to train. The gate requires at least 100 rows and 20 rows from each class. The two-lake, complete-core-
environment, and source-concentration gates now pass: the largest source contributes 55.6% of rows. Current
class values are 15 catch and 3 no-catch. The hourly zero remains a validation result, not a pipeline failure.

## Feature-input validation

- Weather keys are unique by lake and UTC hour; duplicate count: 0.
- Weather pressure and temperature changes are calculated only within each lake series. The first three
  hours per lake are intentionally missing for three-hour deltas.
- Rejected Secchi records: 6 (5 duplicates and
  1 invalid or suspicious values).
- Bay of Quinte has clarity and weather coverage but no separate NOAA whole-lake temperature series.
- NOAA temperatures are explicitly marked as whole-lake daily averages.
- Every normalized row retains a source ID; production eligibility is kept separate from technical usability.
- All eighteen broad rows have air temperature, wind, cloud, and pressure after the bounded environmental join.
- The joined Open-Meteo rows are evaluation-only and remain blocked from production use.
- The WDFW snapshot supplies a useful schema/join example, but its geography is Washington and its
  dataset-specific commercial reuse status remains under review.

## Required next input

Acquire at least 82 more technically valid broad reports, including at least 17 additional no-catch and 5
additional catch reports. Replace evaluation weather with a production-approved provider before deployment.
Precise consented BiteCast logs continue feeding both the broad trip aggregate and the separate hourly
family. Training begins only after
minimum rows, class balance, leakage, duplication, geographic, temporal, and environmental checks pass.

## Files

- `source-manifest.csv`: provenance and rights review.
- `lake-crosswalk.csv`: canonical BiteCast lake identities.
- `normalized/historical-weather.parquet`: hourly weather and derived changes.
- `normalized/bootstrap-outcome-weather.parquet`: bounded evaluation weather for retained forum outcomes.
- `normalized/lake-clarity.parquet`: relevant Secchi observations.
- `normalized/water-conditions.parquet`: daily whole-lake temperature.
- `extracted/aggregate-outcomes-reference.csv`: aggregate reference only; never a label table.
- `extracted/longpoint-broad-observations.parquet`: authorized day-precision broad candidates.
- `extracted/quintefishing-broad-observations.parquet`: eight explicitly reviewed Bay of Quinte candidates.
- `review/quintefishing-outcome-decisions.csv`: auditable post-level acceptance ledger.
- `extracted/wdfw-walleye-interviews.csv`: official transfer-reference assessment, not launch-lake labels.
- `validated/bootstrap-broad.parquet`: eighteen environment-enriched, contract-valid broad rows.
- `bootstrap-readiness-report.json`: machine-readable gates, gaps, and `NO_GO` decision.
- `rejected/outcome-source-rejections.csv`: outcome exclusions and reasons.
- `rejected/lake-clarity-records.csv`: duplicate, invalid, and suspicious clarity rows.
- `quality-report.json`: machine-readable counts, missingness, duplicates, and gaps.
