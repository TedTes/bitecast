# BiteCast model governance

## Scope

The custom model ranks walleye bite conditions. It does not predict whether fish are guaranteed, whether regulations allow fishing, whether a lake is accessible, or whether ice exists or is safe.

## Data admission

- Every external source must have recorded ownership, licence, commercial-use permission, coverage, effort availability, and known bias before ingestion.
- Raw inputs are copied unchanged and identified by SHA-256. Normalized outputs retain the source identifier and quality weight.
- Primary labels require catch/no-catch outcomes and measured fishing effort. Catch-only posts and tournament records cannot represent the negative class.
- Mobile logs require explicit per-trip consent, which defaults off. Consent does not affect access to free logging.
- User identifiers are replaced with keyed HMAC pseudonyms before export. The pseudonym key is a backend secret.

## Privacy and deletion

Account deletion removes source catch logs through the existing deletion function. Training exports preserve the catch-log UUID as trip lineage so a future exclusion list can remove withdrawn observations before retraining. Production policy and legal review must define retention and model-rebuild timing before user data is admitted; the operating target is exclusion from the next training run within 30 days. No service-role key or pseudonym key may enter the mobile application.

## Evaluation

- Trips remain within a single split.
- Newer time periods are reserved for final testing.
- Entire lakes are held out to measure geographic generalization.
- Required metrics include log loss, Brier score, calibration error, ROC AUC, top-20% lift, and segmented lake/month results.
- A challenger cannot be promoted if Brier score regresses by more than 2% or top-window lift falls below 98% of the champion. These are minimum software gates, not sufficient evidence for launch.

## Confidence and explanations

Confidence combines comparable lake observations, missing inputs, unfamiliar categorical values, and ensemble disagreement. Predictions below the minimum evidence score are stored for auditing but not published as forecasts. Reasons use CatBoost SHAP feature contributions mapped to reviewed phrases; no generative model invents explanations.

## Release process

1. Train a challenger from a versioned, validated dataset.
2. Review overall, lake, month, season, and unseen-lake metrics.
3. Run shadow forecasts and compare later outcomes.
4. Publish the immutable artifact and metadata.
5. Promote manually for initial generations.
6. Monitor calibration, missingness, drift, and prediction availability.
7. Roll back by restoring the previous champion artifact.

Scheduled jobs may create challengers but do not auto-promote by default.
Each scheduled dataset is rebuilt from the immutable licensed base corpus plus the cumulative set of currently consented BiteCast logs; it is not trained from only the latest batch.
