#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-bitecast-prod}"
REGION="${REGION:-northamerica-northeast1}"

gcloud run jobs describe bitecast-forecast --project "$PROJECT_ID" --region "$REGION" \
  --format='yaml(metadata.name,spec.template.spec.template.spec.serviceAccountName,spec.template.spec.template.spec.timeoutSeconds,spec.template.spec.template.spec.maxRetries)'
gcloud run jobs describe bitecast-training --project "$PROJECT_ID" --region "$REGION" \
  --format='yaml(metadata.name,spec.template.spec.template.spec.serviceAccountName,spec.template.spec.template.spec.timeoutSeconds,spec.template.spec.template.spec.maxRetries)'

echo "Cloud Scheduler jobs (expected: none):"
gcloud scheduler jobs list --project "$PROJECT_ID" --location "$REGION" --format='table(name,schedule,state)'

echo "Cloud Run executions (expected before activation: none):"
gcloud run jobs executions list --project "$PROJECT_ID" --region "$REGION" --format='table(name,job,completionTime,conditions[0].state)'
