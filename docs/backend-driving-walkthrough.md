# BiteCast backend walkthrough — driving edition

Status date: 2026-11-12

This document continues the BiteCast backend walkthrough from **Step 8** through the remaining production work. It is written for ChatGPT’s **Your Dot** to explain aloud while the user is driving.

## Instructions for Your Dot

When presenting this walkthrough:

1. Explain exactly **one numbered step at a time**.
2. Begin by saying the step number and title.
3. First explain the goal in plain language.
4. Then explain the current implementation.
5. Then state what is not finished or not verified.
6. Avoid reading file paths, SQL names, environment-variable names, or code unless the user asks.
7. Keep the initial spoken explanation to roughly two minutes.
8. If the user asks a question, answer only that question. Do not advance automatically.
9. End every step with: “Say next when you want to continue.”
10. Never suggest that BiteCast guarantees fish or assesses ice safety.
11. Clearly distinguish code that exists from infrastructure that is actually deployed and operating.
12. Do not modify the repository, deploy services, or perform external actions while narrating this document.

## Completed earlier steps

The user has already covered:

1. Overall backend goal
2. Current three-layer architecture
3. Authentication and anonymous user identity
4. Profiles, preferences and followed lakes
5. Offline-first catch logging
6. Supabase database structure
7. Row Level Security and secret separation

Continue with Step 8 below.

---

## Step 8 — Privileged backend functions

### Goal

Some operations are too sensitive for the mobile app. They need to run on a trusted server with private credentials.

The mobile app sends an authenticated request. A Supabase Edge Function verifies the request and performs the privileged operation.

### Current implementation

Three Edge Functions exist.

The first deletes a user account. It verifies the caller and deletes the authentication account. Related user records are designed to be removed through database relationships.

The second receives RevenueCat subscription events. It translates subscription changes into BiteCast entitlement records.

The third sends forecast alerts. It examines upcoming forecast windows, followed lakes, alert thresholds, lead times, quiet hours and push tokens. It records sent alerts to reduce duplicates.

Shared backend utilities provide consistent authorization, Supabase access, HTTP responses and error handling.

### Not finished or not verified

- Hosted deployment has not been confirmed.
- Production secrets still need configuration.
- RevenueCat products and webhook settings still need configuration.
- Expo notification credentials and real-device push testing are still required.
- Alert execution still needs a production schedule.

---

## Step 9 — Training-data sources and admission

### Goal

The custom model must learn from legally usable and statistically meaningful fishing outcomes.

Good primary training data must contain both successful and unsuccessful fishing effort. A list containing only catches cannot teach the model how conditions differ from unsuccessful periods.

### Current implementation

The ML system has a source registry. Every external dataset is expected to record:

- ownership;
- licence;
- commercial-use permission;
- geographic and seasonal coverage;
- whether fishing effort is measured;
- known sampling bias;
- a quality weight.

The ingestion software preserves the original file, calculates a cryptographic hash and creates a manifest. This helps prove exactly which source file entered a dataset.

User logs form a separate source. They are eligible only when the user explicitly consented to training.

### Not finished or not verified

- A real licensed historical base dataset has not been supplied.
- Commercial-use rights have not been reviewed for a production corpus.
- The production source registry still needs real entries.
- Catch-only social posts or tournament records must not be treated as the primary negative-and-positive dataset.

---

## Step 10 — Converting trips into training observations

### Goal

Transform fishing trips of different lengths into comparable units the model can learn from.

The selected unit is an **angler-hour**: one angler fishing for one hour under a particular set of conditions.

### Current implementation

A trip contains its start, end, effort duration and catch outcome. The ingestion pipeline expands the trip across the hours it overlaps.

For example, a three-hour trip can create three hourly observations. If a catch time is known, the appropriate hour receives the positive outcome. Hours without a catch remain negative observations.

Each observation retains trip lineage so that all rows from the same trip can remain together during dataset splitting.

The observation also carries source quality and a pseudonymized contributor identifier.

### Not finished or not verified

- Real-world edge cases need validation against an actual licensed dataset.
- The team must decide how to represent multiple catches across hourly boundaries.
- Legal policy must define how withdrawn consent propagates into future rebuilt datasets and models.

---

## Step 11 — Historical weather and astronomy enrichment

### Goal

Attach the environmental conditions that existed during every historical fishing observation.

The model cannot learn the relationship between conditions and outcomes unless training rows contain time-aligned weather, light and lake information.

### Current implementation

The enrichment layer joins historical weather to observations using lake and hour.

Supported weather fields include temperature, wind, gusts, direction, clouds, precipitation, pressure and recent pressure change.

Astronomy features are calculated from the observation time, coordinates and time zone. They include solar elevation, distance from sunrise and sunset, and moon illumination.

Lake characteristics such as clarity, area and maximum depth are also attached.

The system provides a file-based historical-weather adapter and a provider-neutral HTTP contract.

### Not finished or not verified

- A commercially licensed historical-weather provider has not been selected.
- Lake-water temperature may not be available from ordinary weather providers.
- Historical lake metadata still needs production-quality sourcing and verification.
- Missing-value behavior must be evaluated using real coverage patterns.

---

## Step 12 — Dataset validation and quarantine

### Goal

Prevent malformed, unauthorized, duplicate or logically impossible records from entering model training.

### Current implementation

Every training row is checked against a strict versioned contract.

Validation checks include:

- required identifiers and timestamps;
- supported species and season values;
- valid numeric ranges;
- consistent catch and catch-count outcomes;
- training authorization;
- duplicate observation identifiers.

Accepted rows and rejected rows are written separately. Rejected data is quarantined rather than silently corrected or discarded.

The validator also produces summaries showing row counts, lakes, sources, seasons, months, positive rate and missing-value percentages.

### Not finished or not verified

- Production thresholds for acceptable missingness and lake coverage still need definition.
- Human review procedures for quarantined data still need to be established.
- Real data may reveal additional validation rules.

---

## Step 13 — Feature construction

### Goal

Convert validated observations into the exact columns understood by the model.

### Current implementation

The shared feature builder is used by both training and prediction. This reduces the risk that the model is trained on one representation and served with another.

Categorical features currently include lake, region, season, fishing method, bait category and water clarity.

Numerical features include coordinates, effort, depths, temperature, wind, clouds, precipitation, pressure, light, moon and lake properties.

The pipeline derives cyclical representations for hour of day, day of year and wind direction. Cyclical encoding makes midnight adjacent to the previous late-night hour and makes north-adjacent wind directions numerically close.

Training weights account for source quality, represented effort and overrepresented contributors.

### Not finished or not verified

- Feature usefulness and stability must be tested on real data.
- General forecasts currently default method to jig in open water and tip-up on ice.
- Bait is unknown and fishing depth may be missing during general forecast generation.
- The team should decide whether method-specific features belong in a general lake forecast or in separate strategy forecasts.

---

## Step 14 — Leakage-safe dataset splitting

### Goal

Measure whether the model can predict genuinely unseen future conditions instead of memorizing related observations.

### Current implementation

Rows from one fishing trip are kept in the same split. They cannot be divided between training and testing.

The data is split chronologically so newer periods are reserved for evaluation.

Entire lakes are also held out. This measures whether the model generalizes to geography it did not see during fitting.

The resulting groups include training, validation, recent test and whole-lake holdout data.

### Not finished or not verified

- Split sizes and dates must be tuned to the quantity and seasonality of real data.
- A small dataset may not support meaningful whole-lake evaluation.
- Regional holdouts may be needed in addition to individual-lake holdouts.

---

## Step 15 — CatBoost model training

### Goal

Train a statistical model that estimates the probability of at least one walleye catch during an angler-hour.

### Current implementation

BiteCast uses CatBoost classifiers. CatBoost is suitable for mixed categorical and numerical data, nonlinear relationships and missing values.

Separate models are trained for open-water and ice seasons.

Training creates an ensemble using multiple random seeds. Models use early stopping against validation data to reduce overfitting.

Sample weights reflect source quality and effort.

The fitted models are saved as immutable artifacts with metadata and a dataset hash.

### Not finished or not verified

- Only synthetic data has been used to prove the pipeline.
- No production open-water or ice champion currently exists.
- Hyperparameters must be tuned using real data and robust validation.
- Training success on synthetic fixtures is not evidence of real forecast quality.

---

## Step 16 — Calibration and bite-score conversion

### Goal

Separate the model’s internal probability estimate from the customer-facing BiteCast score.

### Current implementation

Raw ensemble probabilities are calibrated using isotonic regression. Calibration attempts to align predicted probability ranges with observed frequencies.

The displayed bite score is then calculated as a percentile against comparable historical model predictions.

For example, a score of 82 means the current prediction is stronger than roughly 82 percent of the selected reference predictions. It does **not** mean an 82 percent chance of catching a fish.

Reference distributions are stored with the model artifact. When enough history exists, lake-and-season references are preferred; otherwise broader references can be used.

### Not finished or not verified

- Calibration requires enough representative real observations.
- Reference-group selection needs product and statistical review.
- The UI and marketing language must consistently avoid presenting scores as probabilities.

---

## Step 17 — Model evaluation

### Goal

Determine whether a newly trained model is useful, calibrated and better than simple baselines or the existing production model.

### Current implementation

Evaluation calculates:

- log loss;
- Brier score;
- area under the ROC curve;
- calibration error;
- lift among the highest-ranked twenty percent of predictions;
- prevalence-baseline performance;
- results by lake;
- results by month;
- whole-lake holdout results.

The metrics are stored with the model artifact and model-version record.

### Not finished or not verified

- Real launch thresholds have not been proven.
- Metrics must be reviewed separately for open water and ice.
- Rare seasons, lakes and weather regimes need adequate sample sizes.
- Offline metrics should be followed by shadow testing before customer exposure.

---

## Step 18 — Confidence and explanations

### Goal

Tell the user not only the score, but how much evidence supports it and which factors influenced it.

### Current implementation

Confidence considers training coverage for comparable lakes, missing inputs, unfamiliar categories and disagreement across ensemble members.

Predictions below the configured evidence threshold are retained for audits but marked unavailable for customer forecasts.

Reasons come from CatBoost SHAP feature contributions. The strongest contributions are mapped to reviewed phrases such as changing light, wind or pressure. An unrestricted language model does not invent forecast explanations.

### Not finished or not verified

- Confidence thresholds need calibration using real performance and coverage.
- Every approved reason phrase needs product and safety review.
- The system must verify that reason phrases remain faithful when inputs are missing or unusual.

---

## Step 19 — Model registry and promotion

### Goal

Control which trained model is allowed to generate production forecasts and preserve a rollback path.

### Current implementation

Every artifact receives a unique model version.

Versions can be challengers, champions, archived or rejected.

There can be only one production champion for each season.

The default software gate rejects a challenger if its Brier score regresses by more than two percent or its top-window lift falls below ninety-eight percent of the current champion.

Initial promotion is manual. A previous champion can be restored during rollback.

### Not finished or not verified

- There are no real production champions yet.
- The gate values are minimum safeguards, not sufficient launch evidence.
- Artifact storage, signing, retention and disaster recovery still need production design.
- Promotion and rollback procedures require operational testing.

---

## Step 20 — Future feature assembly

### Goal

Create one model input row for every supported lake and future forecast hour.

### Current implementation

The forecast worker loads lake metadata from Supabase.

It requests hourly future weather from a provider-neutral HTTP interface.

It calculates astronomy from each lake’s coordinates, time zone and forecast hour.

It adds season and the current fishing-context defaults.

The completed feature row is sent to the appropriate open-water or ice champion.

A copy can be saved as a feature snapshot for later investigation.

### Not finished or not verified

- A licensed future-weather provider is not connected.
- The provider contract must be mapped to a specific vendor response.
- Missing forecasts and provider outages need production retry and fallback policy.
- General forecast defaults for fishing method and depth need review.

---

## Step 21 — Forecast generation and auditing

### Goal

Turn future features into traceable hourly forecasts and useful fishing windows.

### Current implementation

The champion ensemble produces a calibrated raw probability.

That probability is converted into a percentile bite score. The system calculates confidence and SHAP-based reasons.

Every prediction can be recorded in the audit table with its lake, hour, model version, raw probability, displayed score, confidence and feature hash.

Only sufficiently supported predictions are published to the customer-facing hourly forecast table.

Adjacent strong hours are grouped into forecast windows with start, end, peak score, confidence and reasons.

Database writes use stable uniqueness rules and upserts so rerunning a job does not create uncontrolled duplicates.

### Not finished or not verified

- The worker has not produced real production forecasts.
- Forecast-window thresholds and tactics require validation with real predictions.
- Provider failures, partial lake failures and job retries need operational monitoring.
- Later catch outcomes still need a process for linking back to prior prediction audits.

---

## Step 22 — Mobile forecast delivery

### Goal

Make model forecasts available to the app without embedding model files or private credentials in the phone.

### Current implementation

The mobile app authenticates with Supabase and queries hourly forecasts and forecast windows by lake, species and season.

TanStack Query manages cache-first display and background refresh.

The app maps database rows into its forecast interface and shows scores, reasons, confidence, conditions and windows.

The UI distinguishes bundled demo weather from custom-model output so development data is not misrepresented as production evidence.

### Not finished or not verified

- Remote custom forecasts cannot appear until the database contains champion-generated rows.
- Full offline forecast persistence is currently less complete than offline catch-log persistence.
- Remote error, stale-data and partial-window behavior need device-level end-to-end tests.

---

## Step 23 — Alerts and subscriptions

### Goal

Notify eligible users when a followed lake has a sufficiently strong upcoming window, while respecting preferences and subscription access.

### Current implementation

Users can configure alert status, score threshold, lead time and quiet hours per followed lake.

Push tokens are associated with authenticated users.

The alert function examines future forecast windows and filters them using the user’s settings. Sent-alert records reduce duplicate notifications.

RevenueCat webhook code updates backend entitlement records. The mobile app can read entitlement state through the backend boundary.

Catch logging remains available whether or not the user subscribes.

### Not finished or not verified

- RevenueCat products and production pricing are not connected.
- Webhook authentication and store events need end-to-end tests.
- Expo push credentials and physical-device notification tests are required.
- Alert scheduling, rate limiting, time-zone behavior and quiet-hour edge cases need production verification.

---

## Step 24 — Scheduled retraining

### Goal

Improve the model over time using the licensed base corpus plus cumulative consented BiteCast trips, without automatically replacing a trusted model.

### Current implementation

A GitHub Actions workflow can run monthly or manually.

It downloads the curated base dataset, exports consented user logs, combines both sources, validates the result and checks whether enough new rows exist.

When the threshold is met, it trains new season challengers and uploads artifacts for review.

Automatic promotion is disabled by default.

### Not finished or not verified

- Required CI secrets and the base-dataset location are not configured in this repository.
- The workflow has not been demonstrated with real production data.
- Human review, artifact publication and promotion need an operational runbook.
- Consent withdrawal and account deletion must be reflected in later rebuilt datasets.

---

## Step 25 — Monitoring, rollback and governance

### Goal

Detect when data or model behavior changes, explain incidents, and restore a previous model safely.

### Current implementation

The schema and artifacts preserve model versions, dataset hashes, metrics, feature snapshots and prediction audits.

This provides the foundation for monitoring:

- calibration drift;
- feature missingness;
- unfamiliar categories;
- score distribution changes;
- forecast availability;
- outcome performance by lake, month and season.

The registry retains previous model versions for rollback.

Model governance documentation defines data admission, privacy, evaluation, promotion and explanation principles.

### Not finished or not verified

- Automated drift dashboards and alerts do not yet exist.
- Production logs and error monitoring are not connected.
- A tested incident-response and rollback procedure is still needed.
- Data retention and retraining obligations require legal review.

---

## Step 26 — Deployment status

### Goal

Separate “implemented in the repository” from “running reliably in production.”

### Current implementation

The repository contains:

- Supabase migrations and RLS policies;
- three Edge Functions;
- mobile Supabase adapters;
- the complete Python ML lifecycle;
- a scheduled retraining workflow;
- a forecast worker;
- mobile custom-forecast reading;
- automated unit and integration tests.

The latest verified checks passed TypeScript, engine tests, mobile tests, Expo lint, Python tests and Python lint.

### Not finished or not verified

- Hosted Supabase migration status is unconfirmed.
- Edge Function deployment status is unconfirmed.
- Real service secrets are not part of the repository.
- No licensed weather provider is active.
- No real champion models exist.
- No production forecast worker schedule is active.
- The iOS native build needs re-verification after CocoaPods were removed during disk cleanup.

---

## Step 27 — Remaining work, in recommended order

### Goal

Move BiteCast from a working implementation to a verifiable production system without confusing scaffolding with readiness.

### Recommended sequence

First, stabilize the development environment. Free sufficient disk space, restore CocoaPods through Expo tooling, resolve any native build error and confirm the app runs in iOS and Android test environments.

Second, verify the hosted backend. Confirm the intended Supabase project, migration history, RLS policies and Edge Function deployments using test accounts.

Third, acquire legally usable training and weather data. Review commercial rights, coverage, effort labels, bias and data quality before ingestion.

Fourth, train and evaluate real open-water and ice challengers. Review calibration, lift, lake/month segments, whole-lake holdouts, confidence and explanation quality.

Fifth, run shadow forecasts. Compare predictions with later outcomes without exposing unproven scores to customers.

Sixth, publish and manually promote the first champions. Deploy the forecast worker with monitoring and a rollback path.

Seventh, finish external product services: RevenueCat, Expo notifications, maps, crash reporting, analytics and verified regulations.

Eighth, complete privacy, consent, retention, subscription and store-launch review.

### Definition of backend readiness

The backend should not be called production-ready until:

- migrations and RLS pass hosted tests;
- Edge Functions operate with production secrets;
- licensed base and weather data are documented;
- both seasonal champions pass review and shadow testing;
- forecasts run on schedule with monitoring;
- alerts work on real devices;
- rollback has been tested;
- privacy, consent and deletion policies are approved.

This is the final numbered walkthrough step.

---

## Optional questions Your Dot can offer after Step 27

After completing the numbered walkthrough, ask whether the user wants to explore one of these topics in more detail:

- How CatBoost learns from fishing trips
- Why no-catch trips matter
- How bite score differs from probability
- How confidence is calculated
- How SHAP explanations work
- How RLS protects user data
- How the forecast worker operates hour by hour
- How scheduled retraining avoids replacing the champion automatically
- What is required to select a weather provider
- What must happen before App Store launch
