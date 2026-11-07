# BiteCast v1 implementation brief

BiteCast helps walleye anglers decide when to fish a lake using hourly bite scores, low-light windows, transparent reasons, confidence, tactics, and seven-day planning. v1 targets Ontario and the Great Lakes, open-water and ice seasons, iOS and Android.

Product rules:

- Explain each score with reason chips and a confidence label.
- Say “bite score” and “conditions,” never “guaranteed” or “fish here.”
- Light is the primary factor; pressure and moon are minor modifiers.
- Catch logging works offline and stays free.
- Ice mode always displays: “BiteCast does not assess ice safety. Check ice yourself and follow local guidance.”
- Regulations are summaries; the linked official source governs.
- Onboarding preview offers “Unlock the full forecast” (paywall) or “Continue with free logging”, which finishes onboarding on the free plan without showing the paywall.
- Paywall prices are visibly marked as development placeholders until RevenueCat products load.

Routes: onboarding welcome/season/lakes/preview, paywall, Today, Map, Log, Profile, lake forecast, window detail, regulations, new/edit log, stats, alert settings, account linking, and lake request.

External services are adapter boundaries in v1 development: Supabase, weather ingestion, RevenueCat, PostHog, Sentry, Expo push, and production map tiles. Local demo data and SQLite make the client usable until credentials are supplied.

