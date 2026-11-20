# BiteCast Google Cloud workers

The production project is `bitecast-prod` in `northamerica-northeast1`.

Two Cloud Run Jobs are provisioned:

- `bitecast-forecast`: batch forecast publication, capped at one task, one CPU, 2 GiB, 15 minutes, and zero retries.
- `bitecast-training`: challenger training, capped at one task, two CPUs, 4 GiB, 60 minutes, and zero retries.

Neither job has a Cloud Scheduler trigger, so no recurring compute is active. The training job remains dormant. The forecast job has been exercised manually with protected early-access canaries; the first successful end-to-end execution was `bitecast-forecast-x2sng` on 2026-11-20.

The jobs use separate service accounts. Training can write model artifacts; forecasting can only read them. Secrets are represented by empty Secret Manager containers and are not attached to either job until real secret versions are supplied.

## Cost controls

- No schedules. Forecast executions are manual and bounded during early access; training remains manual and dormant.
- One task per execution, no retries, and bounded timeouts/resources.
- Minimum Artifact Registry retention and one model-artifact bucket.
- A project-filtered CAD 5 billing budget sends alerts at 50%, 90%, and 100%. A Google Cloud budget is an alert, not a hard spending cap.
- Artifact Registry deletes image versions older than 14 days while retaining the two newest versions of each package.

Run `./infra/gcp/verify-workers.sh` to confirm the jobs remain unscheduled and have no executions.

## Activation prerequisites

Before either worker is activated:

1. Add a secret version for the Supabase service-role key. ECCC forecast access is anonymous and needs no provider credential.
2. Attach only the secrets needed by each job.
3. Upload separate open-water and ice champion bundles, or explicitly protected early-access canaries.
4. Publish each artifact into `bitecast.model_versions` before inference so prediction audits have valid model lineage. Early-access artifacts stay `challenger`; publishing is not promotion.
5. Run one manual forecast canary and inspect its database audit rows.
6. Run one manual training canary and ensure it produces a challenger only.
7. Add schedules only after canaries pass and usage is measured.

## Verified early-access forecast

The 2026-11-20 canary published 1,168 hourly forecasts and 27 windows for eight active lakes. It also wrote 1,168 matching prediction audits. Live verification found no score above 69 and no confidence label other than `Low`. Window copy states that the scores are an early-access relative outlook, not validated catch probabilities, and do not promise fish or assess ice safety.

Never place these secrets in the mobile app or repository.
