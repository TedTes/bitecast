import { describe, expect, it } from 'vitest';
import { normalizeCatchLog } from '@/features/catch-log';
import { validateCatchLog } from '@/features/catch-log-validation';
import { methodFields, methodOptions, methodsForSeason, methodsOf, methodsText, type LogWithMethods } from '@/features/trip-methods';

const base: LogWithMethods = {
  id: '11111111-1111-4111-8111-111111111111', lakeId: 'lake-erie', caughtAt: '2026-11-22T14:59:00.000Z',
  tripStartedAt: '2026-11-22T13:00:00.000Z', tripEndedAt: '2026-11-22T15:00:00.000Z', effortMinutes: 120,
  species: 'walleye', seasonMode: 'open_water', caught: true, count: 3, bait: 'Crankbait', baitCategory: 'crankbait',
  method: 'jig', clarity: 'stained', notes: '', scoreAtTime: 56, trainingConsent: false,
  trainingConsentVersion: 'v1', trainingConsentUpdatedAt: '2026-11-22T15:00:00.000Z', modelVersionShown: 'test',
  lightCondition: 'Mid light', conditions: { temperatureC: 5, windKmh: 10, summary: '' },
  syncState: 'pending', clientUpdatedAt: '2026-11-22T15:00:00.000Z',
};

describe('trip methods', () => {
  it('offers tip-up on ice only, unless the edited log already has it', () => {
    expect(methodOptions('open_water')).toEqual(['jig', 'troll', 'cast']);
    expect(methodOptions('ice')).toEqual(['jig', 'tip-up']);
    expect(methodOptions('open_water', ['tip-up'])).toContain('tip-up');
  });

  it('carries over only what suits the season', () => {
    expect(methodsForSeason('open_water', ['tip-up'])).toEqual(['jig']);
    expect(methodsForSeason('ice', ['troll'])).toEqual(['tip-up']);
    expect(methodsForSeason('open_water', ['jig', 'troll'])).toEqual(['jig', 'troll']);
  });

  it('saves one method as before', () => {
    expect(methodFields(['troll'], undefined, true)).toEqual({ method: 'troll', methods: ['troll'], caughtOnMethod: undefined });
  });

  it('never guesses which of several methods caught the fish', () => {
    expect(methodFields(['jig', 'troll'], undefined, true).method).toBe('other');
    expect(methodFields(['jig', 'troll'], 'troll', true).method).toBe('troll');
    expect(methodFields(['jig', 'troll'], 'cast', true).method).toBe('other');
  });

  it('has no winning method on a no-catch trip', () => {
    expect(methodFields(['jig', 'troll'], 'troll', false)).toEqual({ method: 'other', methods: ['jig', 'troll'], caughtOnMethod: undefined });
  });

  it('stores the same order however they were tapped', () => {
    expect(methodFields(['troll', 'jig'], undefined, true).methods).toEqual(['jig', 'troll']);
  });

  it('survives a SQLite save and reload, and still passes sync validation', () => {
    for (const caughtOn of [undefined, 'troll'] as const) {
      const saved: LogWithMethods = { ...base, ...methodFields(['jig', 'troll'], caughtOn, true) };
      const loaded: LogWithMethods = normalizeCatchLog(JSON.parse(JSON.stringify(saved)));
      expect(methodsOf(loaded)).toEqual(['jig', 'troll']);
      expect(loaded.caughtOnMethod).toBe(caughtOn);
      expect(methodsText(loaded)).toBe('Jig, Troll');
      expect(validateCatchLog(loaded).validForSync).toBe(true);
    }
  });

  it('reads logs saved with a single method', () => {
    expect(methodsOf(base)).toEqual(['jig']);
  });
});
