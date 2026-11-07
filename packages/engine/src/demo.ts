import type { LakeProfile, WeatherHour } from './types';

export function createDemoWeather(lake: LakeProfile, start = new Date()): WeatherHour[] {
  const base = new Date(start);
  base.setMinutes(0, 0, 0);
  return Array.from({ length: 168 }, (_, index) => {
    const ts = new Date(base.getTime() + index * 3_600_000);
    const hour = ts.getHours() + ts.getMinutes() / 60;
    const day = Math.floor(index / 24);
    const solar = Math.sin(((hour - 6) / 12) * Math.PI);
    const sunElevation = solar > 0 ? solar * 42 : -10 + Math.max(-solar, 0) * 4;
    const lakeSeed = lake.name.length % 9;
    return {
      ts: ts.toISOString(),
      sunElevation,
      cloudPct: Math.round(36 + 27 * Math.sin((index + lakeSeed) / 7) + day * 2) % 100,
      windKmh: Math.max(2, Math.round(11 + 7 * Math.sin((index + lakeSeed) / 4))),
      precipitationMm: index % 17 === 0 ? 0.8 : 0,
      pressureHpa: 1016 - index * 0.035 + 2 * Math.sin(index / 10),
      moonIllumination: 0.62,
      fetchedAt: start.toISOString(),
    };
  });
}
