import { walleyeProfile } from './profile';
import type { Confidence, ForecastHour, ForecastWindow, LakeForecast, LakeProfile, Season, WeatherHour } from './types';

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

function surfaceLight(elevation: number) {
  if (elevation <= -6) return 0;
  return clamp((elevation + 6) / 46);
}

function suitability(light: number, band: [number, number]) {
  const [low, high] = band;
  if (light >= low && light <= high) return 1;
  if (light < low) return clamp(1 - (low - light) / Math.max(low, 0.12));
  return clamp(1 - (light - high) / Math.max(1 - high, 0.2));
}

function confidenceFor(lake: LakeProfile, hour: WeatherHour, now: Date): Confidence {
  const ageHours = (now.getTime() - new Date(hour.fetchedAt).getTime()) / 3_600_000;
  const aheadHours = (new Date(hour.ts).getTime() - now.getTime()) / 3_600_000;
  if (ageHours > 6 || aheadHours > 72) return 'Low';
  if (!lake.clarity) return 'Medium';
  return 'High';
}

function reasonSet(hour: WeatherHour, light: number, transition: number, pressureTerm: number, season: Season) {
  const candidates: Array<[number, string]> = [];
  if (hour.sunElevation < 8) candidates.push([0.95, hour.sunElevation < 0 ? 'Low light after sunset' : 'Low light near twilight']);
  if (hour.cloudPct >= 55) candidates.push([0.65, 'Overcast softens the light']);
  if (season === 'open_water' && hour.windKmh >= 12) candidates.push([0.55, 'Wind chop reduces visibility']);
  if (hour.precipitationMm > 0.3) candidates.push([0.38, 'Rain reduces surface light']);
  if (transition > 0.35) candidates.push([0.9, 'Fast light transition']);
  if (pressureTerm >= 0.55) candidates.push([0.3, 'Stable pressure']);
  if (light > 0.68) candidates.push([0.8, 'Bright conditions may slow activity']);
  if (hour.windKmh < 4 && season === 'open_water') candidates.push([0.42, 'Calm surface keeps light penetration high']);
  return candidates.sort((a, b) => b[0] - a[0]).slice(0, 4).map((item) => item[1]);
}

export function computeForecast(lake: LakeProfile, weather: WeatherHour[], season: Season, now = new Date()): LakeForecast {
  const clarity = lake.clarity ?? 'stained';
  const band = walleyeProfile.idealLightBand[clarity];
  let previousLight = 0;
  let previousPressure = weather[0]?.pressureHpa ?? 1013;

  const hours: ForecastHour[] = weather.map((hour) => {
    const sun = surfaceLight(hour.sunElevation);
    const cloud = clamp(hour.cloudPct / 100);
    const chop = season === 'ice' ? 0 : clamp(hour.windKmh / 30);
    const precipitation = clamp(hour.precipitationMm / 4);
    const moon = hour.sunElevation <= -6 ? hour.moonIllumination * 0.08 : 0;
    const light = clamp(sun * (1 - 0.6 * cloud) * (1 - 0.3 * chop) * (1 - 0.2 * precipitation) + moon);
    const transition = clamp(Math.abs(light - previousLight) * 4.2);
    const pressureDelta = hour.pressureHpa - previousPressure;
    const pressure = pressureDelta <= 0.3 ? 0.62 : clamp(0.62 - pressureDelta / 4);
    const moonSuitability = hour.sunElevation < -6 ? hour.moonIllumination : 0.15;
    const score = Math.round(100 * clamp(0.65 * suitability(light, band) + walleyeProfile.transitionWeight * transition + walleyeProfile.pressureWeight * pressure + walleyeProfile.moonWeight * moonSuitability));
    const reasons = reasonSet(hour, light, transition, pressure, season);
    previousLight = light;
    previousPressure = hour.pressureHpa;
    return { ...hour, light, transition, score, reasons, confidence: confidenceFor(lake, hour, now) };
  });

  return {
    lakeId: lake.id,
    engineVersion: walleyeProfile.version,
    computedAt: now.toISOString(),
    hours,
    windows: buildWindows(hours, season),
  };
}

function buildWindows(hours: ForecastHour[], season: Season): ForecastWindow[] {
  const groups: ForecastHour[][] = [];
  let group: ForecastHour[] = [];
  hours.forEach((hour, index) => {
    if (hour.score >= 60) {
      group.push(hour);
      return;
    }
    const next = hours[index + 1];
    if (group.length && next?.score >= 60) group.push(hour);
    else if (group.length) { groups.push(group); group = []; }
  });
  if (group.length) groups.push(group);

  const candidates = groups.map((windowHours, index) => {
    const peak = [...windowHours].sort((a, b) => b.score - a.score)[0];
    const lightLevel = peak.light < 0.24 ? 'low' : peak.light < 0.55 ? 'mid' : 'high';
    const tactic = walleyeProfile.tactics.find((item) => item.season === season && item.light === lightLevel)!;
    const reasons = [...new Set(windowHours.flatMap((hour) => hour.reasons))].slice(0, 4);
    const confidence: Confidence = windowHours.some((hour) => hour.confidence === 'Low') ? 'Low' : windowHours.some((hour) => hour.confidence === 'Medium') ? 'Medium' : 'High';
    return {
      id: `${windowHours[0].ts}-${index}`,
      start: windowHours[0].ts,
      end: windowHours[windowHours.length - 1].ts,
      peakScore: peak.score,
      reasons,
      confidence,
      depth: tactic.depth,
      tactics: tactic.text,
      hours: windowHours,
    };
  });
  const byDay = candidates.reduce<Record<string, ForecastWindow[]>>((acc, window) => {
    const day = window.start.slice(0, 10);
    acc[day] = [...(acc[day] ?? []), window];
    return acc;
  }, {});
  return Object.keys(byDay).sort().flatMap((day) => byDay[day]
    .sort((a, b) => b.peakScore - a.peakScore || b.hours.length - a.hours.length)
    .slice(0, 3));
}
