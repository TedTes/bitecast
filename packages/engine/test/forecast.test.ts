import { describe, expect, it } from 'vitest';
import { computeForecast, createDemoWeather, type LakeProfile } from '../src';

const lake: LakeProfile = { id: 'test', name: 'Test Lake', region: 'Ontario', provinceState: 'ON', latitude: 45, longitude: -79, clarity: 'clear' };

describe('walleye forecast engine', () => {
  it('returns explained, bounded scores and ranked windows', () => {
    const now = new Date('2026-07-10T12:00:00.000Z');
    const forecast = computeForecast(lake, createDemoWeather(lake, now), 'open_water', now);
    expect(forecast.hours).toHaveLength(168);
    expect(forecast.hours.every((hour) => hour.score >= 0 && hour.score <= 100)).toBe(true);
    expect(forecast.hours.every((hour) => hour.reasons.length >= 1)).toBe(true);
    expect(forecast.windows.length).toBeGreaterThan(0);
    expect(forecast.windows.every((window) => window.reasons.length >= 1 && window.tactics.length > 0)).toBe(true);
    const perDay = forecast.windows.reduce<Record<string, number>>((acc, window) => ({ ...acc, [window.start.slice(0, 10)]: (acc[window.start.slice(0, 10)] ?? 0) + 1 }), {});
    expect(Object.values(perDay).every((count) => count <= 3)).toBe(true);
  });

  it('disables wind chop in ice mode', () => {
    const now = new Date('2026-01-10T12:00:00.000Z');
    const weather = createDemoWeather(lake, now).map((hour) => ({ ...hour, windKmh: 30 }));
    const open = computeForecast(lake, weather, 'open_water', now);
    const ice = computeForecast(lake, weather, 'ice', now);
    expect(open.hours.some((hour) => hour.light !== ice.hours[0].light)).toBe(true);
  });
});
