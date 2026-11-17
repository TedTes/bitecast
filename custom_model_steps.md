Agreed. We can set the deterministic engine aside and build BiteCast as a purely data-driven custom model.

The system should then behave differently when evidence is insufficient: return low confidence or no forecast instead of falling back to handcrafted rules.

## Model definition

The first model should predict:

```text
P(at least one walleye catch during an angler-hour)
```

The displayed `0–100` bite score would be a relative ranking of predicted conditions—not a literal percentage chance of catching.

Later, we can add a second model for expected catch count.

## Model architecture

Start with CatBoost or LightGBM because the data will be structured and include:

- Weather measurements
- Time and astronomy
- Lake characteristics
- Season
- Fishing method
- Depth and clarity
- Geographic region
- Missing values
- Categorical fields

I would start with CatBoost, then benchmark LightGBM against it.

Use separate models for:

- Open-water walleye
- Ice-mode walleye

Do not model ice presence, thickness, accessibility, or safety.

## Pure custom-model pipeline

```text
Historical outcomes
        ↓
Historical weather + astronomy + lake data
        ↓
Validated angler-hour training rows
        ↓
Feature generation
        ↓
CatBoost training
        ↓
Calibration and lake/time holdout testing
        ↓
Model registry
        ↓
Hourly forecast generation
        ↓
Bite score + confidence + explanations
```

## Micro implementation order

### 1. Create the ML workspace

```text
ml/
  pyproject.toml
  README.md
  config/
  contracts/
  ingestion/
  validation/
  features/
  training/
  evaluation/
  inference/
  artifacts/
  tests/
```

Install:

- Python 3.12
- Polars or Pandas
- DuckDB
- CatBoost
- LightGBM
- scikit-learn
- Pydantic
- MLflow or a lightweight model registry
- SHAP

### 2. Define the training-row contract

Every row represents one hour of fishing:

```text
trip_id
anonymous_angler_id
lake_id
latitude
longitude
hour_start
effort_minutes
caught
catch_count
season_mode
method
bait_category
fishing_depth_m
water_depth_m
water_clarity
weather fields
astronomy fields
lake characteristics
source
source_quality
```

### 3. Change catch logging

Add:

- Start and end time
- Duration
- No-catch shortcut
- Species
- Catch count
- Approximate fishing area
- Depth
- Method
- Bait
- Training-consent status
- Forecast/model version shown

A timestamped catch without fishing duration cannot provide a reliable negative training example.

### 4. Build a historical-data registry

For each candidate source, record:

- Dataset owner
- License
- Geographic coverage
- Date range
- Species
- Whether no-catch outcomes exist
- Whether effort exists
- Timestamp precision
- Location precision
- Known biases

Do not begin model training until we know which datasets are legally and statistically usable.

### 5. Create ingestion pipelines

Convert each source into the shared training contract.

Each importer should:

1. Preserve the raw record.
2. Normalize timestamps and units.
3. Map lake identifiers.
4. Validate species.
5. Normalize methods and baits.
6. Calculate effort.
7. Mark missing fields.
8. Assign a source-quality weight.
9. Deduplicate records.
10. Write versioned Parquet files.

### 6. Enrich observations

For every angler-hour, attach historical—not forecast—conditions:

- Wind speed, gust, and direction
- Cloud cover
- Precipitation
- Pressure and pressure changes
- Temperature
- Sunrise and sunset distance
- Solar elevation
- Moon illumination
- Season progression
- Lake clarity
- Lake size and depth characteristics

Feature calculation must be identical during training and production inference.

### 7. Validate the dataset

Reject or flag:

- Impossible timestamps
- Negative fishing duration
- Extreme catch counts
- Trips outside lake boundaries
- Duplicate observations
- Future weather accidentally joined to historical trips
- Missing outcome labels
- Suspicious automated logging
- Records with incompatible licenses

Generate a quality report for every dataset version.

### 8. Create leakage-safe splits

Use:

- Older dates for training
- Newer dates for final testing
- Entire lakes held out for geographic generalization
- Entire anglers held out where appropriate
- Entire trips kept within one split

Never use a random row split.

### 9. Train the first model

1. Train CatBoost on the binary catch target.
2. Weight observations by effort and source quality.
3. Correct for anglers who contribute disproportionate volumes.
4. Tune hyperparameters using the validation period.
5. Train several seeds for stability.
6. Calibrate predictions using isotonic or Platt calibration.
7. Store the exact feature and dataset versions.

### 10. Create BiteCast scores

Do not display raw probability directly.

For each lake and forecast period:

1. Predict every hourly catch probability.
2. Compare those hours with the lake’s historical distribution.
3. Convert them into relative percentiles.
4. Map the percentiles to `0–100`.
5. Identify contiguous high-scoring forecast windows.

This makes `92` mean “among the strongest modeled conditions for this lake,” not “92% chance of catching.”

### 11. Calculate model confidence

Confidence should use data, not manually assigned rules:

- Number of comparable training observations
- Distance from the training distribution
- Agreement across the model ensemble
- Missing feature percentage
- Historical calibration for that lake and season
- Prediction stability across nearby hours

If evidence is insufficient, return:

```ts
{
  forecastAvailable: false,
  reason: "Not enough comparable data"
}
```

### 12. Generate explanations

Use feature contributions from the trained model:

1. Calculate SHAP values.
2. Select the largest positive and negative contributions.
3. Translate them through an approved phrase library.
4. Show only factors that materially changed the prediction.
5. Never let an LLM invent forecast explanations.

### 13. Evaluate before deployment

Required evaluation:

- Log loss
- Brier score
- Calibration
- Precision and lift in top-scoring windows
- Ranking accuracy
- Performance by lake
- Performance by month
- Performance by season mode
- Unseen-lake performance
- Performance with missing weather fields

The model should not ship merely because its overall accuracy looks good.

### 14. Deploy as a batch forecast service

A scheduled Python worker should:

1. Read active lakes.
2. Fetch hourly forecast weather.
3. Generate features.
4. Run the production model.
5. Calculate scores, confidence, and SHAP explanations.
6. Create forecast windows.
7. Write results to Supabase.
8. Record the model version and input snapshot.

The mobile app only reads completed forecasts.

### 15. Retraining lifecycle

- Ingest user logs continuously.
- Validate logs daily.
- Evaluate new data weekly.
- Retrain monthly or after a minimum data threshold.
- Register the new model as a challenger.
- Compare it against the production model.
- Require manual approval initially.
- Roll out by lake or percentage.
- Retain immediate rollback capability.

## First build milestone

The first coding milestone should produce:

1. `ml/` Python workspace.
2. Versioned training-data contract.
3. Dataset validation framework.
4. Historical weather enrichment interface.
5. CatBoost training command.
6. Time/lake-based evaluation command.
7. Model artifact format.
8. Batch inference command.
9. Test fixture with synthetic data.
10. Documentation showing how real licensed data plugs into the pipeline.

After that foundation is working, the next task is acquiring and auditing the first real historical dataset.