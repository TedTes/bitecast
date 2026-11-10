import { describe, expect, it } from 'vitest';
import { byBait, byLight, byTimeOfDay, summary } from '@/features/stats';
import type { CatchLog } from '@/types/app';

const log = (hour: number, caught: boolean, bait: string, light: CatchLog['lightCondition'], count = 1): CatchLog => ({
  id: `${hour}-${bait}-${Math.random()}`, lakeId: 'lake-erie', caughtAt: new Date(2026, 5, 1, hour).toISOString(), caught, count: caught ? count : 0,
  tripStartedAt: new Date(2026, 5, 1, hour - 2).toISOString(), tripEndedAt: new Date(2026, 5, 1, hour).toISOString(), effortMinutes: 120,
  species: 'walleye', seasonMode: 'open_water', bait, baitCategory: bait.toLowerCase(), method: 'jig', clarity: 'stained', notes: '', scoreAtTime: 70, lightCondition: light,
  trainingConsent: false, modelVersionShown: 'test-model',
  conditions: { temperatureC: 11, windKmh: 10, summary: '' }, syncState: 'pending', clientUpdatedAt: new Date().toISOString(),
});

const logs = [
  log(6, true, 'Jig + minnow', 'Low light', 3),
  log(7, true, 'jig + minnow ', 'Low light', 2),
  log(19, true, 'Crankbait', 'Low light'),
  log(13, false, 'Crankbait', 'Bright'),
  log(14, false, 'Worm harness', 'Bright'),
];

describe('personal stats', () => {
  it('buckets trips by time of day', () => {
    const dawn = byTimeOfDay(logs).find((b) => b.key === 'dawn')!;
    expect(dawn.trips).toBe(2);
    expect(dawn.rate).toBe(1);
    expect(byTimeOfDay(logs).find((b) => b.key === 'afternoon')!.rate).toBe(0);
  });

  it('computes catch rate by light', () => {
    expect(byLight(logs).find((b) => b.key === 'Low light')!.rate).toBe(1);
    expect(byLight(logs).find((b) => b.key === 'Bright')!.rate).toBe(0);
  });

  it('groups baits case- and whitespace-insensitively and ranks by fish', () => {
    const top = byBait(logs)[0];
    expect(top.key).toBe('jig + minnow');
    expect(top.fish).toBe(5);
    expect(top.trips).toBe(2);
  });

  it('only calls a best pattern with at least two trips', () => {
    const s = summary(logs);
    expect(s.trips).toBe(5);
    expect(s.fish).toBe(6);
    expect(s.bestPeriod?.key).toBe('dawn');
    expect(summary([logs[2]]).bestPeriod).toBeUndefined();
  });
});
