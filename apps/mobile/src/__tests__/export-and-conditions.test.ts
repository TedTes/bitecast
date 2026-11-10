import { describe, expect, it } from 'vitest';
import { catchLogsToCsv } from '@/features/export';
import { freshness } from '@/features/forecast-metadata';
import { resolveLakeCondition } from '@/features/lake-condition';
import type { CatchLog } from '@/types/app';

const base: CatchLog = {
  id: '1', lakeId: 'lake-erie', caughtAt: '2026-06-01T10:00:00.000Z', caught: true, count: 2, bait: 'Jig, "purple"', method: 'jig',
  tripStartedAt: '2026-06-01T08:00:00.000Z', tripEndedAt: '2026-06-01T10:00:00.000Z', effortMinutes: 120,
  species: 'walleye', seasonMode: 'open_water', baitCategory: 'jig', trainingConsent: true, modelVersionShown: 'test-model',
  clarity: 'stained', notes: 'Line one\nline two', scoreAtTime: 80, lightCondition: 'Low light',
  conditions: { temperatureC: 11, windKmh: 10, summary: 'Overcast' }, syncState: 'pending', clientUpdatedAt: '2026-06-01T10:00:00.000Z',
};

describe('CSV export', () => {
  it('writes a header and escapes commas, quotes and newlines', () => {
    const [header, row] = catchLogsToCsv([base]).split(/\n(?=2026)/);
    expect(header.startsWith('trip_started_at,trip_ended_at,effort_minutes,caught_at,lake')).toBe(true);
    expect(row).toContain('Lake Erie');
    expect(row).toContain('"Jig, ""purple"""');
    expect(row).toContain('"Line one\nline two"');
  });
});

describe('per-lake condition', () => {
  const winter = new Date(2027, 0, 20, 12);
  it('prefers a manual choice', () => {
    expect(resolveLakeCondition('lake-erie', { iceFishing: false }, { 'lake-erie': 'ice' }, winter)).toEqual({ season: 'ice', source: 'manual' });
  });
  it('uses open water for anglers who do not ice fish', () => {
    expect(resolveLakeCondition('rainy-lake', { iceFishing: false }, {}, winter)).toEqual({ season: 'open_water', source: 'open-only' });
  });
  it('uses the typical season for the lake when ice fishing is on', () => {
    expect(resolveLakeCondition('rainy-lake', { iceFishing: true }, {}, winter)).toEqual({ season: 'ice', source: 'typical' });
    expect(resolveLakeCondition('rainy-lake', { iceFishing: true }, {}, new Date(2026, 6, 1))).toEqual({ season: 'open_water', source: 'typical' });
  });
});

describe('forecast freshness', () => {
  const now = Date.UTC(2026, 10, 7, 12);
  it('labels fresh, aging and stale data', () => {
    expect(freshness(now - 30_000, now)).toEqual({ state: 'fresh', label: 'Updated just now' });
    expect(freshness(now - 12 * 60_000, now).label).toBe('Updated 12 min ago');
    expect(freshness(now - 2 * 3_600_000, now).state).toBe('aging');
    expect(freshness(now - 5 * 3_600_000, now)).toEqual({ state: 'stale', label: 'Forecast is 5 h old' });
    expect(freshness(now - 3 * 86_400_000, now).label).toBe('Forecast is 3 days old');
  });
});
