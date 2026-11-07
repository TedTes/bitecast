# BiteCast coding rules

1. Product behavior is defined by `docs/product-spec.md`; update it intentionally when behavior changes.
2. `packages/engine` is pure TypeScript with no I/O and no app or Supabase imports. Engine changes require tests.
3. Database objects live in schema `bitecast`, backend functions are prefixed `bitecast-`, and every table uses RLS.
4. Never put a service-role key in the mobile app. Public client values belong in `EXPO_PUBLIC_*`; secrets belong in EAS/Supabase secrets.
5. Catch-log writes go to local SQLite before any network sync.
6. Forecast UI always shows reasons and confidence. Never promise fish or ice safety.
7. Logging remains available without a subscription.
8. Do not edit generated `ios/` or `android/` folders; configure native behavior through Expo config plugins.

