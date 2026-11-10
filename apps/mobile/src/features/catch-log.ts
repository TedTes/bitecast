import type { CatchLog } from '@/types/app';

/** Adds privacy-safe defaults to logs created before the model-training contract existed. */
export function normalizeCatchLog(log: Partial<CatchLog> & Pick<CatchLog, 'id' | 'lakeId' | 'caughtAt'>): CatchLog {
  const end = new Date(log.tripEndedAt ?? log.caughtAt);
  const effortMinutes = log.effortMinutes ?? 120;
  return {
    ...log,
    tripStartedAt: log.tripStartedAt ?? new Date(end.getTime() - effortMinutes * 60_000).toISOString(),
    tripEndedAt: end.toISOString(),
    effortMinutes,
    species: 'walleye',
    seasonMode: log.seasonMode ?? 'open_water',
    baitCategory: log.baitCategory ?? log.bait?.toLowerCase() ?? 'unknown',
    trainingConsent: log.trainingConsent ?? false,
    modelVersionShown: log.modelVersionShown ?? 'legacy-local-log',
  } as CatchLog;
}
