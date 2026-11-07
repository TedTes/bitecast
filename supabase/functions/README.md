# BiteCast Edge Function boundaries

Implement and deploy these functions after external credentials and weather licensing are confirmed:

- `bitecast-fetch-weather`: hourly weather ingestion for active lakes.
- `bitecast-compute-forecast`: run `@bitecast/engine` per lake and upsert hourly forecasts/windows.
- `bitecast-send-alerts`: 15-minute alert sweep with confidence, entitlement, quiet-hour and daily-dedup checks.
- `bitecast-revenuecat-webhook`: verify RevenueCat webhook authorization and upsert entitlements.
- `bitecast-delete-account`: delete BiteCast rows and apply the shared-project auth-user policy.

Never expose the service-role key in the mobile app. Cron calls should use a secret header stored in Supabase secrets.
