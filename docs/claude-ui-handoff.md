# Claude Code handoff prompt

Use the prompt below after this implementation is checked out.

```text
You are the UI/UX designer and implementation partner for BiteCast, a mobile-first Expo SDK 58 app for Ontario and Great Lakes walleye anglers.

Read these before changing code:
- docs/product-spec.md
- AGENTS.md and CLAUDE.md
- apps/mobile/src/constants/theme.ts
- every route under apps/mobile/src/app
- reusable UI in apps/mobile/src/components/ui.tsx and forecast.tsx

Objective: complete a cohesive, premium, outdoors-oriented UI/UX pass across all 17 BiteCast routes while preserving every working flow, route, local SQLite write, engine result, product-safety rule, and external-service placeholder. Work directly in the code and verify the app—do not only produce mockups.

Design direction:
- Quiet, trustworthy lake-journal aesthetic: deep lake ink, mineral teal, fog/cream surfaces, restrained sunrise warmth.
- Information-dense enough for an angler planning quickly, but calm and scannable outdoors.
- Scores are never shown without reasons and confidence on forecast surfaces.
- Avoid generic gradient-heavy startup visuals, glossy glass, gamification, social-feed patterns, and “AI magic” language.
- Make score, window time, reasons, and tactics the visual hierarchy in that order.
- Use a real typographic system with accessible Dynamic Type behavior and consistent spacing, corner and elevation tokens.
- Respect minimum 44×44 touch targets, screen-reader labels, contrast, reduced motion, loading/empty/error/offline/stale states, safe areas, keyboard avoidance, small phones and large Android text.

Required screen pass:
1. Welcome: replace the temporary symbol mark with a distinctive code-native BiteCast brand moment and a believable forecast preview.
2. Season: strengthen the open-water/ice choices and keep the fixed ice-safety disclaimer impossible to miss.
3. Lakes: polish search, region filtering, 1–5 selection feedback, no-results and offline states.
4. Preview: maximize the value reveal before paywall while keeping reasons/confidence explicit.
5. Paywall: improve annual/monthly selection, trial/renewal disclosure, restore/loading/error states, and keep free logging visible.
6. Today: refine followed-lake comparison, season switching, freshness/stale state and cards.
7. Lake forecast: refine current score, 24-hour chart interaction, windows, tactics, confidence and 7-day outlook.
8. Window detail: create the clearest possible explanation of light curve, contributors and tactics without implying certainty.
9. Regulations: improve hierarchy and official-source trust; the official source always governs.
10. Map: keep the current code-native cached map fallback, then create a production-ready map component boundary for react-native-maps or MapLibre. Preserve blank-background pins offline.
11. Log history: optimize quick logging, grouping/filtering, sync-state and empty state.
12. New/edit log: target under 15 seconds using defaults, thumb-friendly controls and robust validation; writes must remain SQLite-first.
13. Stats: make best hours, lures and light-condition catch rate legible; preserve <5 logs education.
14. Profile: clarify anonymous vs linked account, units, season default, export, restore and deletion.
15. Alerts: improve per-lake score threshold, lead time, master switch, permission-denied and quiet-hour UX.
16. Auth: polish Apple/Google linking, including linking-conflict messaging. Apple must remain available on iOS if Google is offered.
17. Request lake: polish success, validation and offline queue behavior.

Implementation constraints:
- Stay with Expo Router and TypeScript; check SDK 58 docs before using Expo APIs.
- Prefer existing dependencies and code-native visuals. Explain any new dependency in your final summary.
- Do not hardcode real subscription prices until RevenueCat products are connected; make placeholders obvious in development.
- Do not add GPS catch spots, ice-thickness claims, guaranteed-catch wording, or unverified regulations.
- Do not bypass src/api adapters or place secrets in code.
- Keep packages/engine free of UI/I/O imports.
- Run npm run typecheck, npm run lint, npm test, and npx expo-doctor; fix failures you introduce.

Deliverables:
- Implemented UI/UX improvements across all routes.
- Reusable tokens and components, not repeated per-screen styling.
- Accessibility labels and all specified states.
- A short changelog, remaining production-integration checklist, and screenshots of representative iOS/Android widths if the environment supports them.
```
