import { describe, expect, it } from 'vitest';
import { normalizeCatchLog } from '@/features/catch-log';
import { validateCatchLog } from '@/features/catch-log-validation';
import { byBait } from '@/features/stats';
import { baitFields, baitOptions, baitsForSeason, baitsOf, baitsText, type TripLog } from '@/features/trip-baits';

const base: TripLog = {
  id: '11111111-1111-4111-8111-111111111111', lakeId: 'lake-erie', caughtAt: '2026-11-22T14:59:00.000Z',
  tripStartedAt: '2026-11-22T13:00:00.000Z', tripEndedAt: '2026-11-22T15:00:00.000Z', effortMinutes: 120,
  species: 'walleye', seasonMode: 'open_water', caught: true, count: 3, bait: 'Crankbait', baitCategory: 'crankbait',
  method: 'troll', clarity: 'stained', notes: '', scoreAtTime: 56, trainingConsent: false,
  trainingConsentVersion: 'v1', trainingConsentUpdatedAt: '2026-11-22T15:00:00.000Z', modelVersionShown: 'test',
  lightCondition: 'Mid light', conditions: { temperatureC: 5, windKmh: 10, summary: '' },
  syncState: 'pending', clientUpdatedAt: '2026-11-22T15:00:00.000Z',
};
const two = ['Jig + minnow', 'Crankbait'];
const presets = ['Jig + minnow', 'Crankbait', 'Worm harness', 'Blade bait'];

describe('trip baits', () => {
  it('saves one bait as before', () => {
    expect(baitFields(['Crankbait'], undefined, true)).toEqual({ baits: ['Crankbait'], caughtOnBait: undefined, bait: 'Crankbait', baitCategory: 'crankbait' });
  });

  it('credits the bait the fish came on', () => {
    expect(baitFields(two, 'Crankbait', true)).toMatchObject({ bait: 'Crankbait', baitCategory: 'crankbait', caughtOnBait: 'Crankbait' });
  });

  it('never guesses which bait caught the fish', () => {
    expect(baitFields(two, undefined, true)).toMatchObject({ bait: 'Jig + minnow, Crankbait', baitCategory: 'unknown' });
    expect(baitFields(two, 'Spoon', true).baitCategory).toBe('unknown');
    expect(baitFields(two, 'Crankbait', false).caughtOnBait).toBeUndefined();
  });

  it('gives Patterns the winning bait, not every bait tried', () => {
    const ranked = byBait([{ ...base, ...baitFields(two, 'Crankbait', true) }]);
    expect(ranked.map((item) => [item.label, item.fish])).toEqual([['Crankbait', 3]]);
  });

  it('drops repeats whatever their case', () => {
    expect(baitFields(['Crankbait', ' crankbait '], undefined, true).baits).toEqual(['Crankbait']);
  });

  it('stays inside the sync limit with many long names', () => {
    const many = ['a', 'b', 'c'].map((letter) => letter.repeat(60));
    const saved: TripLog = { ...base, ...baitFields(many, undefined, true) };
    expect(validateCatchLog(saved).validForSync).toBe(true);
    expect(baitsOf(saved)).toEqual(many);
  });

  it('survives a SQLite save and reload', () => {
    const loaded: TripLog = normalizeCatchLog(JSON.parse(JSON.stringify({ ...base, ...baitFields(two, 'Crankbait', true) })));
    expect(baitsText(loaded)).toBe('Jig + minnow, Crankbait');
    expect(loaded.caughtOnBait).toBe('Crankbait');
  });

  it('follows the season but keeps what is picked', () => {
    const iceTrip: TripLog = { ...base, seasonMode: 'ice', bait: 'Rattle bait' };
    expect(baitOptions([iceTrip], 'open_water', presets)).toEqual(presets);
    expect(baitOptions([iceTrip], 'open_water', presets, ['Spoon'])).toContain('Spoon');
    expect(baitsForSeason([iceTrip], 'open_water', presets)).toEqual(['Jig + minnow']);
    expect(baitsForSeason([iceTrip], 'ice', ['Jigging spoon'])).toEqual(['Rattle bait']);
  });
});
