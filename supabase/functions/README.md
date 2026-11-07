# BiteCast Edge Functions

Implemented and ready to deploy:

- `bitecast-send-alerts`: 15-minute alert sweep with confidence, entitlement, quiet-hour and daily-dedup checks.
- `bitecast-revenuecat-webhook`: verify RevenueCat webhook authorization and upsert entitlements.
- `bitecast-delete-account`: verify the caller, delete BiteCast rows, then delete the auth user.

Still blocked on a licensed weather-provider contract:

- `bitecast-fetch-weather`: hourly weather ingestion for active lakes.
- `bitecast-compute-forecast`: run `@bitecast/engine` per lake and upsert hourly forecasts/windows.

Set `REVENUECAT_WEBHOOK_AUTH` and `BITECAST_CRON_SECRET` as Supabase secrets. Schedule the alert function every 15 minutes with the cron secret in `x-bitecast-cron-secret`. Configure RevenueCat to send the exact authorization value stored in `REVENUECAT_WEBHOOK_AUTH`.

Never expose the service-role key in the mobile app. Cron calls should use a secret header stored in Supabase secrets.
