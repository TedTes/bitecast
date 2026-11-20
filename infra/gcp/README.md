# BiteCast Google Cloud workers

The production project is `bitecast-prod` in `northamerica-northeast1`.

Two Cloud Run Jobs are provisioned:

- `bitecast-forecast`: batch forecast publication, capped at one task, one CPU, 2 GiB, 15 minutes, and zero retries.
- `bitecast-training`: challenger training, capped at one task, two CPUs, 4 GiB, 60 minutes, and zero retries.

Both jobs are deliberately dormant. Provisioning creates no Cloud Scheduler jobs and does not execute either Cloud Run Job. This prevents recurring compute while the champion model and production data-provider secrets are incomplete.

The jobs use separate service accounts. Training can write model artifacts; forecasting can only read them. Secrets are represented by empty Secret Manager containers and are not attached to either job until real secret versions are supplied.

## Cost controls

- No schedules and no executions during bootstrap.
- One task per execution, no retries, and bounded timeouts/resources.
- Minimum Artifact Registry retention and one model-artifact bucket.
- A project-filtered CAD 5 billing budget sends alerts at 50%, 90%, and 100%. A Google Cloud budget is an alert, not a hard spending cap.
- Artifact Registry deletes image versions older than 14 days while retaining the two newest versions of each package.

Run `./infra/gcp/verify-workers.sh` to confirm the jobs remain unscheduled and have no executions.

## Activation prerequisites

Before either worker is activated:

1. Add a secret version for the Supabase service-role key. ECCC forecast access is anonymous and needs no provider credential.
2. Attach only the secrets needed by each job.
3. Upload and approve separate open-water and ice champion bundles.
4. Run one manual forecast canary and inspect its database audit rows.
5. Run one manual training canary and ensure it produces a challenger only.
6. Add schedules only after canaries pass and usage is measured.

Never place these secrets in the mobile app or repository.
