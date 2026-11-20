import { describe, expect, it } from 'vitest';
import { normalizeCatchLog } from '@/features/catch-log';
import { validateCatchLog } from '@/features/catch-log-validation';
import type { CatchLog } from '@/types/app';

const validLog: CatchLog = {
  id: 'ca7c08ba-e468-4e26-98f1-9bc5887c7cc6',
  lakeId: 'lake-erie',
  caughtAt: '2026-06-01T09:15:00.000Z',
  tripStartedAt: '2026-06-01T08:00:00.000Z',
  tripEndedAt: '2026-06-01T10:00:00.000Z',
  effortMinutes: 120,
  species: 'walleye',
  seasonMode: 'open_water',
  caught: true,
  count: 1,
  bait: 'Jig and minnow',
  baitCategory: 'jig and minnow',
  method: 'jig',
  clarity: 'stained',
  notes: '',
  scoreAtTime: 72,
  trainingConsent: true,
  trainingConsentVersion: 'bitecast-training-v1-2026-11-14',
  trainingConsentUpdatedAt: '2026-06-01T10:01:00.000Z',
  modelVersionShown: 'demo-v1',
  lightCondition: 'Low light',
  conditions: { temperatureC: 14, windKmh: 11, summary: 'Cloudy' },
  syncState: 'pending',
  clientUpdatedAt: '2026-06-01T10:01:00.000Z',
};

describe('catch-log validation', () => {
  it('accepts a complete consented trip for sync and training', () => {
    expect(validateCatchLog(validLog)).toEqual({ validForSync: true, eligibleForTraining: true, issues: [] });
  });

  it('syncs a valid unconsented trip but excludes it from training', () => {
    const result = validateCatchLog({ ...validLog, trainingConsent: false });
    expect(result.validForSync).toBe(true);
    expect(result.eligibleForTraining).toBe(false);
  });

  it('rejects inconsistent outcomes and effort', () => {
    const result = validateCatchLog({ ...validLog, caught: false, count: 2, effortMinutes: 30 });
    expect(result.validForSync).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining(['effort_mismatch', 'inconsistent_outcome']));
  });

  it('turns legacy unversioned consent off during migration', () => {
    const migrated = normalizeCatchLog({
      ...validLog,
      trainingConsent: true,
      trainingConsentVersion: undefined,
      trainingConsentUpdatedAt: undefined,
    });
    expect(migrated.trainingConsent).toBe(false);
  });
});
