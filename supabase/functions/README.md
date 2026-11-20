# BiteCast Edge Functions

Implemented and ready to deploy:

- `bitecast-send-alerts`: 15-minute alert sweep with confidence, entitlement, quiet-hour and daily-dedup checks.
- `bitecast-revenuecat-webhook`: verify RevenueCat webhook authorization and upsert entitlements.
- `bitecast-delete-account`: verify the caller, delete BiteCast rows, then delete the auth user.

The Python custom-model worker in `ml/` replaces the earlier planned deterministic forecast functions. It writes model forecasts and audit snapshots after a licensed weather provider and approved champion artifacts are configured.

Still blocked on licensed data/provider contracts:

- historical outcome/weather data for training and evaluation;
- forecast-weather ingestion for active lakes;
- approved open-water and ice champion model artifacts.

Set `REVENUECAT_WEBHOOK_AUTH` and `BITECAST_CRON_SECRET` as Supabase secrets. Schedule the alert function every 15 minutes with the cron secret in `x-bitecast-cron-secret`. Configure RevenueCat to send the exact authorization value stored in `REVENUECAT_WEBHOOK_AUTH`.

Never expose the service-role key in the mobile app. Cron calls should use a secret header stored in Supabase secrets.
