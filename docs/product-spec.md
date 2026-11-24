# DawnBite v1 implementation brief

DawnBite helps anglers decide when to fish using bite-condition scores, low-light windows, transparent reasons, confidence, tactics, and seven-day planning. Precise champions produce hourly forecasts; a separately trained broad champion may provide explicitly labeled time-block outlooks while hourly evidence is still sparse. v1 starts with walleye across Ontario and the Great Lakes, supports open-water and ice seasons, and targets iOS and Android.

Product rules:

- Explain each score with reason chips and a confidence label.
- Say “bite score” and “conditions,” never “guaranteed” or “fish here.”
- Production forecasts come only from the versioned custom statistical model. They are not blended with or backed by a handcrafted scoring formula.
- The model registry keeps `hourly` and `trip_broad` families separate. The forecast worker always prefers an approved hourly champion and uses an approved broad champion only as a fallback.
- Broad evidence remains one trip/report per label with its original time precision. It is never expanded into invented hourly catch labels. Broad forecasts repeat one model result across an identified time block, stay Low confidence, and must say they do not identify an exact peak hour.
- A bite score is the percentile rank of a model prediction against comparable historical model output; it is not a catch probability or safety rating.
- Early-access bootstrap scores are relative ranks within the next three-day horizon, capped at 69, always Low confidence, and never presented as validated catch probabilities.
- Confidence is derived from training coverage, missing inputs, unfamiliar categories, and disagreement across the model ensemble. If evidence is insufficient, show that a forecast is unavailable instead of inventing one.
- Forecast reasons come from model feature contributions mapped through approved language; unrestricted generated explanations are not allowed.
- Catch logging works offline and stays free.
- Model training requires explicit per-trip consent. Consent defaults off, legacy logs remain excluded, and logging works identically without consent.
- Each consent decision records the policy version and decision time. Changing consent creates a backend audit event; only currently consented, validated, non-deleted logs may enter a new training snapshot.
- Hourly training observations measure effort with trip start, trip end, duration, and catch/no-catch outcome. A timestamped catch without effort is not an eligible hourly row. Broad bootstrap observations may retain unknown effort, but receive lower source/time-precision weights and train only the separate `trip_broad` family.
- Synced logs are validated and deduplicated independently of training consent. Sync failures remain visible and retryable while the SQLite copy remains authoritative on the device.
- Each lake has its own condition, open water or ice. It defaults to the lake’s typical season for its latitude and date when the angler ice fishes (open water otherwise) and can be set by hand per lake. “Typical” describes when lakes usually freeze; it is never an ice-safety assessment.
- Ice mode always displays: “DawnBite does not assess ice safety. Check ice yourself and follow local guidance.”
- Regulations are summaries; the linked official source governs.
- DawnBite 1.0 is free-only. Onboarding enters the product directly; no paywall, simulated purchase, premium gate, or restore-purchase control is exposed. Logging, seven-day forecasts, and window alerts remain available without a subscription.

Routes: onboarding welcome/season/lakes/preview, Today, Map, Log, Profile, lake forecast, window detail, regulations, new/edit log, stats, alert settings, account linking, and lake request. The dormant paywall route redirects into the free product for backward-compatible development links.

Supabase anonymous auth, identity linking, catch-log sync, lake requests, Expo notification permission/token registration, connectivity monitoring, account deletion, RevenueCat entitlement webhooks, and alert delivery are implemented behind credential-safe adapter boundaries. The custom-model training, evaluation, family-aware registry, broad fallback, batch inference, auditing, and scheduled hourly retraining software is implemented. The forecast adapter uses ECCC GeoMet's anonymous RDPS 10 km feed, validates and retries point forecasts, normalizes units, and exposes up to 84 hourly steps. An explicitly enabled early-access registry may serve protected canary-only broad models while data accumulates; those artifacts cannot enter the production champion path, scores are horizon-relative and capped, and confidence is always Low. Production-quality claims remain blocked until sufficient validated outcome evidence and approved champion artifacts exist. RevenueCat store products, PostHog, Sentry, and production map tiles remain external boundaries and are not exposed in the free-only 1.0 interface. Published forecasts are cached in local SQLite after a successful refresh and are reused when the network is unavailable. Local demo data keeps an unconfigured client usable; demo forecasts are not evidence for either custom-model family.

