# BiteCast v1 implementation brief

BiteCast helps walleye anglers decide when to fish a lake using hourly bite scores, low-light windows, transparent reasons, confidence, tactics, and seven-day planning. v1 targets Ontario and the Great Lakes, open-water and ice seasons, iOS and Android.

Product rules:

- Explain each score with reason chips and a confidence label.
- Say “bite score” and “conditions,” never “guaranteed” or “fish here.”
- Production forecasts come only from the versioned custom statistical model. They are not blended with or backed by a handcrafted scoring formula.
- A bite score is the percentile rank of a model prediction against comparable historical model output; it is not a catch probability or safety rating.
- Confidence is derived from training coverage, missing inputs, unfamiliar categories, and disagreement across the model ensemble. If evidence is insufficient, show that a forecast is unavailable instead of inventing one.
- Forecast reasons come from model feature contributions mapped through approved language; unrestricted generated explanations are not allowed.
- Catch logging works offline and stays free.
- Model training requires explicit per-trip consent. Consent defaults off, legacy logs remain excluded, and logging works identically without consent.
- Training observations measure effort with trip start, trip end, duration, and catch/no-catch outcome. A timestamped catch without effort is not an eligible training row.
- Each lake has its own condition, open water or ice. It defaults to the lake’s typical season for its latitude and date when the angler ice fishes (open water otherwise) and can be set by hand per lake. “Typical” describes when lakes usually freeze; it is never an ice-safety assessment.
- Ice mode always displays: “BiteCast does not assess ice safety. Check ice yourself and follow local guidance.”
- Regulations are summaries; the linked official source governs.
- Onboarding preview offers “Unlock the full forecast” (paywall) or “Continue with free logging”, which finishes onboarding on the free plan without showing the paywall.
- Paywall prices are visibly marked as development placeholders until RevenueCat products load.

Routes: onboarding welcome/season/lakes/preview, paywall, Today, Map, Log, Profile, lake forecast, window detail, regulations, new/edit log, stats, alert settings, account linking, and lake request.

Supabase anonymous auth, identity linking, catch-log sync, lake requests, Expo notification permission/token registration, connectivity monitoring, account deletion, RevenueCat entitlement webhooks, and alert delivery are implemented behind credential-safe adapter boundaries. The custom-model training, evaluation, registry, batch inference, auditing, and scheduled-retraining software is implemented, but production forecasts remain blocked until licensed historical outcomes/weather, a validated champion artifact, and a licensed forecast-weather provider are supplied. RevenueCat store products, PostHog, Sentry, and production map tiles also remain external boundaries. Local demo data and SQLite keep the client usable without any external configuration; demo forecasts are not evidence for the custom model.

