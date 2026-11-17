# BiteCast v1 implementation brief

BiteCast helps walleye anglers decide when to fish a lake using bite-condition scores, low-light windows, transparent reasons, confidence, tactics, and seven-day planning. Precise champions produce hourly forecasts; a separately trained broad champion may provide explicitly labeled time-block outlooks while hourly evidence is still sparse. v1 targets Ontario and the Great Lakes, open-water and ice seasons, iOS and Android.

Product rules:

- Explain each score with reason chips and a confidence label.
- Say “bite score” and “conditions,” never “guaranteed” or “fish here.”
- Production forecasts come only from the versioned custom statistical model. They are not blended with or backed by a handcrafted scoring formula.
- The model registry keeps `hourly` and `trip_broad` families separate. The forecast worker always prefers an approved hourly champion and uses an approved broad champion only as a fallback.
- Broad evidence remains one trip/report per label with its original time precision. It is never expanded into invented hourly catch labels. Broad forecasts repeat one model result across an identified time block, stay Low confidence, and must say they do not identify an exact peak hour.
- A bite score is the percentile rank of a model prediction against comparable historical model output; it is not a catch probability or safety rating.
- Confidence is derived from training coverage, missing inputs, unfamiliar categories, and disagreement across the model ensemble. If evidence is insufficient, show that a forecast is unavailable instead of inventing one.
- Forecast reasons come from model feature contributions mapped through approved language; unrestricted generated explanations are not allowed.
- Catch logging works offline and stays free.
- Model training requires explicit per-trip consent. Consent defaults off, legacy logs remain excluded, and logging works identically without consent.
- Each consent decision records the policy version and decision time. Changing consent creates a backend audit event; only currently consented, validated, non-deleted logs may enter a new training snapshot.
- Hourly training observations measure effort with trip start, trip end, duration, and catch/no-catch outcome. A timestamped catch without effort is not an eligible hourly row. Broad bootstrap observations may retain unknown effort, but receive lower source/time-precision weights and train only the separate `trip_broad` family.
- Synced logs are validated and deduplicated independently of training consent. Sync failures remain visible and retryable while the SQLite copy remains authoritative on the device.
- Each lake has its own condition, open water or ice. It defaults to the lake’s typical season for its latitude and date when the angler ice fishes (open water otherwise) and can be set by hand per lake. “Typical” describes when lakes usually freeze; it is never an ice-safety assessment.
- Ice mode always displays: “BiteCast does not assess ice safety. Check ice yourself and follow local guidance.”
- Regulations are summaries; the linked official source governs.
- Onboarding preview offers “Unlock the full forecast” (paywall) or “Continue with free logging”, which finishes onboarding on the free plan without showing the paywall.
- Paywall prices are visibly marked as development placeholders until RevenueCat products load.

Routes: onboarding welcome/season/lakes/preview, paywall, Today, Map, Log, Profile, lake forecast, window detail, regulations, new/edit log, stats, alert settings, account linking, and lake request.

Supabase anonymous auth, identity linking, catch-log sync, lake requests, Expo notification permission/token registration, connectivity monitoring, account deletion, RevenueCat entitlement webhooks, and alert delivery are implemented behind credential-safe adapter boundaries. The custom-model training, evaluation, family-aware registry, broad fallback, batch inference, auditing, and scheduled hourly retraining software is implemented. The production forecast adapter targets Open-Meteo's paid commercial customer endpoint and validates, retries, and normalizes its hourly response; production forecasts remain blocked until the commercial key, sufficient validated outcome evidence, approved champion artifacts, and a deployed worker are supplied. RevenueCat store products, PostHog, Sentry, and production map tiles also remain external boundaries. Local demo data and SQLite keep the client usable without any external configuration; demo forecasts are not evidence for either custom-model family.

