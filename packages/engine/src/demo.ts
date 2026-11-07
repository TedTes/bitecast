import type { LakeProfile, WeatherHour } from './types';

/**
 * Deterministic demo weather for development. Each lake gets its own sequence of daily
 * weather regimes (seeded by lake id + calendar day), blended smoothly hour to hour, so
 * lakes and days differ believably and the same day looks the same on every launch.
 * Pressure changes stay gentle; fronts bring cloud, rain and falling pressure.
 */

type Regime = { cloud: [number, number]; wind: [number, number]; rain: number; pressure: number };

const regimes: Regime[] = [
  { cloud: [4, 18], wind: [2, 7], rain: 0, pressure: 0.04 }, // bluebird, calm
  { cloud: [70, 96], wind: [7, 14], rain: 0.05, pressure: 0 }, // overcast
  { cloud: [25, 55], wind: [17, 28], rain: 0.02, pressure: 0.02 }, // windy
  { cloud: [65, 100], wind: [12, 22], rain: 0.35, pressure: -0.18 }, // rainy front
  { cloud: [30, 70], wind: [6, 15], rain: 0.06, pressure: 0.01 }, // mixed
];

function hashString(value: string) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32: small, fast, deterministic PRNG in [0, 1). */
function prng(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (t: number) => t * t * (3 - 2 * t);

/** Approximate moon illumination (0–1) from the synodic month. */
export function moonIllumination(date: Date) {
  const knownNewMoon = Date.UTC(2000, 0, 6, 18, 14);
  const synodic = 29.530588853 * 86_400_000;
  const phase = (((date.getTime() - knownNewMoon) % synodic) + synodic) % synodic / synodic;
  return (1 - Math.cos(phase * 2 * Math.PI)) / 2;
}

type DayWeather = { cloud: number; wind: number; rain: number; pressure: number; cloudSwing: number; windSwing: number };

function dayWeather(lake: LakeProfile, dayNumber: number): DayWeather {
  const random = prng(hashString(`${lake.id}:${dayNumber}`));
  // Neighbouring lakes share some weather: blend a regional pick with a local one.
  const regional = prng(hashString(`${Math.round(lake.latitude / 3)}:${Math.round(lake.longitude / 4)}:${dayNumber}`));
  const regime = regimes[Math.floor((random() < 0.55 ? regional() : random()) * regimes.length)];
  const big = lake.region.toLowerCase().includes('great lakes');
  return {
    cloud: lerp(regime.cloud[0], regime.cloud[1], random()),
    wind: lerp(regime.wind[0], regime.wind[1], random()) + (big ? 4 : 0),
    rain: regime.rain,
    pressure: regime.pressure,
    cloudSwing: 6 + random() * 14,
    windSwing: 2 + random() * 5,
  };
}

export function createDemoWeather(lake: LakeProfile, start = new Date()): WeatherHour[] {
  const base = new Date(start);
  base.setMinutes(0, 0, 0);
  const hourly = prng(hashString(`${lake.id}:${Math.floor(base.getTime() / 3_600_000)}`));
  const days = new Map<number, DayWeather>();
  const day = (n: number) => {
    if (!days.has(n)) days.set(n, dayWeather(lake, n));
    return days.get(n)!;
  };
  let pressure = 1012 + (hashString(lake.id) % 9);

  return Array.from({ length: 168 }, (_, index) => {
    const ts = new Date(base.getTime() + index * 3_600_000);
    const hour = ts.getHours() + ts.getMinutes() / 60;
    const solar = Math.sin(((hour - 6) / 12) * Math.PI);
    const sunElevation = solar > 0 ? solar * 42 : -10 + Math.max(-solar, 0) * 4;

    // Blend today's regime into tomorrow's across the evening for smooth transitions.
    const dayNumber = Math.floor(ts.getTime() / 86_400_000);
    const today = day(dayNumber);
    const tomorrow = day(dayNumber + 1);
    const blend = smoothstep(Math.max(0, Math.min(1, (hour - 16) / 8)));
    const cloudBase = lerp(today.cloud, tomorrow.cloud, blend);
    const windBase = lerp(today.wind, tomorrow.wind, blend);
    const rainChance = lerp(today.rain, tomorrow.rain, blend);
    const trend = lerp(today.pressure, tomorrow.pressure, blend);

    // Afternoon breeze and gentle wandering on top of the regime.
    const diurnalWind = Math.max(0, Math.sin(((hour - 9) / 12) * Math.PI)) * today.windSwing;
    const cloud = cloudBase + Math.sin((index + hourly() * 2) / 5) * today.cloudSwing * 0.5 + (hourly() - 0.5) * 8;
    const wind = windBase + diurnalWind + (hourly() - 0.5) * 3;
    pressure += Math.max(-0.28, Math.min(0.25, trend + (hourly() - 0.5) * 0.08));

    return {
      ts: ts.toISOString(),
      sunElevation,
      cloudPct: Math.round(Math.max(0, Math.min(100, cloud))),
      windKmh: Math.max(1, Math.round(wind)),
      precipitationMm: hourly() < rainChance ? Math.round((0.4 + hourly() * 2.2) * 10) / 10 : 0,
      pressureHpa: Math.round(pressure * 10) / 10,
      moonIllumination: Math.round(moonIllumination(ts) * 100) / 100,
      fetchedAt: start.toISOString(),
    };
  });
}
