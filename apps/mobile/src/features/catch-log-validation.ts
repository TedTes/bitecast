import type { CatchLog } from '@/types/app';

export type CatchLogValidation = {
  validForSync: boolean;
  eligibleForTraining: boolean;
  issues: string[];
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const validDate = (value: string) => Number.isFinite(Date.parse(value));
const inRange = (value: number | undefined, minimum: number, maximum: number) => (
  value === undefined || (Number.isFinite(value) && value >= minimum && value <= maximum)
);

/** Validates all cloud-synced fields; consent controls training eligibility, not logging access. */
export function validateCatchLog(log: CatchLog): CatchLogValidation {
  const issues: string[] = [];
  const start = Date.parse(log.tripStartedAt);
  const end = Date.parse(log.tripEndedAt);
  const caughtAt = Date.parse(log.caughtAt);

  if (!uuid.test(log.id)) issues.push('invalid_id');
  if (!log.lakeId.trim()) issues.push('missing_lake');
  if (![log.tripStartedAt, log.tripEndedAt, log.caughtAt, log.clientUpdatedAt].every(validDate)) {
    issues.push('invalid_timestamp');
  }
  if (Number.isFinite(start) && Number.isFinite(end)) {
    if (end <= start) issues.push('invalid_trip_window');
    const measuredEffort = Math.round((end - start) / 60_000);
    if (Math.abs(measuredEffort - log.effortMinutes) > 2) issues.push('effort_mismatch');
  }
  if (log.caught && Number.isFinite(caughtAt) && (caughtAt < start || caughtAt > end)) {
    issues.push('catch_outside_trip');
  }
  if (!Number.isInteger(log.effortMinutes) || log.effortMinutes < 1 || log.effortMinutes > 1440) {
    issues.push('invalid_effort');
  }
  if ((log.caught && log.count < 1) || (!log.caught && log.count !== 0)) {
    issues.push('inconsistent_outcome');
  }
  if (log.species !== 'walleye') issues.push('unsupported_species');
  if (!['open_water', 'ice'].includes(log.seasonMode)) issues.push('invalid_season');
  if (!inRange(log.lengthCm, 1, 200)) issues.push('invalid_length');
  if (!inRange(log.depthM, 0, 100)) issues.push('invalid_fishing_depth');
  if (!inRange(log.waterDepthM, 0, 300)) issues.push('invalid_water_depth');
  if (!inRange(log.scoreAtTime, 0, 100)) issues.push('invalid_score');
  if (log.bait.length > 100) issues.push('bait_too_long');
  if (log.notes.length > 500) issues.push('notes_too_long');

  const consentMetadataValid = Boolean(
    log.trainingConsentVersion.trim()
      && validDate(log.trainingConsentUpdatedAt)
      && Date.parse(log.trainingConsentUpdatedAt) <= Date.parse(log.clientUpdatedAt),
  );
  if (log.trainingConsent && !consentMetadataValid) issues.push('invalid_training_consent');

  return {
    validForSync: issues.length === 0,
    eligibleForTraining: issues.length === 0 && log.trainingConsent && consentMetadataValid,
    issues,
  };
}
