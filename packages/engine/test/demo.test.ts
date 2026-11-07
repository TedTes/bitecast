import { describe, expect, it } from 'vitest';
import { computeForecast, createDemoWeather, moonIllumination, type LakeProfile } from '../src';

const lake = (id: string, latitude: number, region = 'Ontario'): LakeProfile => ({ id, name: id, region, provinceState: 'ON', latitude, longitude: -79, clarity: 'stained' });
const start = new Date('2026-11-07T15:00:00.000Z');

describe('demo weather', () => {
  it('is deterministic for the same lake and start', () => {
    expect(createDemoWeather(lake('a', 44), start)).toEqual(createDemoWeather(lake('a', 44), start));
  });

  it('stays within physical ranges with gentle pressure changes', () => {
    const weather = createDemoWeather(lake('a', 44), start);
    expect(weather).toHaveLength(168);
    weather.forEach((hour, index) => {
      expect(hour.cloudPct).toBeGreaterThanOrEqual(0);
      expect(hour.cloudPct).toBeLessThanOrEqual(100);
      expect(hour.windKmh).toBeGreaterThanOrEqual(1);
      expect(hour.precipitationMm).toBeGreaterThanOrEqual(0);
      expect(hour.moonIllumination).toBeGreaterThanOrEqual(0);
      expect(hour.moonIllumination).toBeLessThanOrEqual(1);
      if (index > 0) expect(Math.abs(hour.pressureHpa - weather[index - 1].pressureHpa)).toBeLessThanOrEqual(0.35);
    });
  });

  it('differs between lakes', () => {
    const a = createDemoWeather(lake('lake-a', 44), start).map((h) => h.cloudPct);
    const b = createDemoWeather(lake('lake-b', 49), start).map((h) => h.cloudPct);
    expect(a).not.toEqual(b);
  });

  it('produces a realistic spread of scores and windows across the week', () => {
    const peaks = ['erie', 'simcoe', 'nipissing', 'rainy', 'quinte', 'woods'].flatMap((id, i) => {
      const profile = lake(id, 42 + i * 1.3, i % 2 ? 'Great Lakes' : 'Ontario');
      return computeForecast(profile, createDemoWeather(profile, start), 'open_water', start).windows.map((w) => w.peakScore);
    });
    expect(peaks.length).toBeGreaterThan(0);
    expect(Math.max(...peaks) - Math.min(...peaks)).toBeGreaterThanOrEqual(10);
  });

  it('tracks the lunar cycle', () => {
    expect(moonIllumination(new Date('2000-01-06T18:14:00Z'))).toBeLessThan(0.01);
    expect(moonIllumination(new Date('2000-01-21T07:00:00Z'))).toBeGreaterThan(0.95);
  });
});
