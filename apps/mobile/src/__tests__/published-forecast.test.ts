import type { LakeForecast } from '@bitecast/engine';
import { describe, expect, it } from 'vitest';
import { publishedForecast } from '@/features/published-forecast';

const forecast = (engineVersion: string, hours = 1) => ({ engineVersion, hours: Array(hours).fill({}), windows: [] }) as unknown as LakeForecast;

describe('publishedForecast', () => {
  it('hides bundled demo scores once cloud forecasts are connected', () => {
    expect(publishedForecast(forecast('walleye-1.0.0'), true)).toBeUndefined();
  });

  it('keeps demo forecasts in builds without a cloud connection', () => {
    const demo = forecast('walleye-1.0.0');
    expect(publishedForecast(demo, false)).toBe(demo);
  });

  it('keeps published model forecasts', () => {
    const published = forecast('trip-broad-open_water-20261120174949-b0c68e00');
    expect(publishedForecast(published, true)).toBe(published);
  });

  it('treats a forecast without hours as none', () => {
    expect(publishedForecast(forecast('trip-broad-1', 0), true)).toBeUndefined();
  });
});
