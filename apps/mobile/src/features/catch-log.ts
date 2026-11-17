import type { CatchLog } from '@/types/app';

export const TRAINING_CONSENT_VERSION = 'bitecast-training-v1-2026-11-14';

/** Adds privacy-safe defaults to logs created before the model-training contract existed. */
export function normalizeCatchLog(log: Partial<CatchLog> & Pick<CatchLog, 'id' | 'lakeId' | 'caughtAt'>): CatchLog {
  const end = new Date(log.tripEndedAt ?? log.caughtAt);
  const effortMinutes = log.effortMinutes ?? 120;
  // Consent without an auditable policy version and decision time is not valid consent.
  const hasVersionedConsent = Boolean(
    log.trainingConsent === true && log.trainingConsentVersion && log.trainingConsentUpdatedAt,
  );
  return {
    ...log,
    tripStartedAt: log.tripStartedAt ?? new Date(end.getTime() - effortMinutes * 60_000).toISOString(),
    tripEndedAt: end.toISOString(),
    effortMinutes,
    species: 'walleye',
    seasonMode: log.seasonMode ?? 'open_water',
    baitCategory: log.baitCategory ?? log.bait?.toLowerCase() ?? 'unknown',
    trainingConsent: hasVersionedConsent,
    trainingConsentVersion: log.trainingConsentVersion ?? TRAINING_CONSENT_VERSION,
    trainingConsentUpdatedAt: log.trainingConsentUpdatedAt ?? log.clientUpdatedAt ?? end.toISOString(),
    modelVersionShown: log.modelVersionShown ?? 'legacy-local-log',
  } as CatchLog;
}
