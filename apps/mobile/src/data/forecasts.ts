import { computeForecast, createDemoWeather, type LakeForecast, type Season } from '@bitecast/engine';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { lakes } from './lakes';

const anchor = new Date();
anchor.setMinutes(0, 0, 0);

/** In-memory stand-in for the SQLite forecast cache. */
const cache = new Map<string, LakeForecast>();

/** Synchronous cached read (what the device already has). */
export function getForecast(lakeId: string, season: Season): LakeForecast {
  const key = `${lakeId}:${season}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const lake = lakes.find((item) => item.id === lakeId) ?? lakes[0];
  const forecast = computeForecast(lake, createDemoWeather(lake, anchor), season, anchor);
  cache.set(key, forecast);
  return forecast;
}

/**
 * Network refresh boundary. In development this recomputes from demo weather; in
 * production it should read `bitecast-forecast` from Supabase and write the cache.
 */
async function fetchForecast(lakeId: string, season: Season): Promise<LakeForecast> {
  return getForecast(lakeId, season);
}

/** Cache-first forecast: renders cached data immediately, refreshes in the background. */
export const forecastQuery = (lakeId: string, season: Season) =>
  queryOptions({
    queryKey: ['forecast', lakeId, season],
    queryFn: () => fetchForecast(lakeId, season),
    initialData: () => getForecast(lakeId, season),
    initialDataUpdatedAt: () => new Date(getForecast(lakeId, season).computedAt).getTime(),
    staleTime: 15 * 60_000,
  });

export function useForecast(lakeId: string, season: Season) {
  return useQuery(forecastQuery(lakeId, season));
}

export type Freshness = { state: 'fresh' | 'aging' | 'stale'; label: string };
export function freshness(updatedAt: number, now = Date.now()): Freshness {
  const minutes = Math.max(0, Math.round((now - updatedAt) / 60_000));
  if (minutes < 2) return { state: 'fresh', label: 'Updated just now' };
  if (minutes < 60) return { state: 'fresh', label: `Updated ${minutes} min ago` };
  const hours = Math.round(minutes / 60);
  if (hours < 3) return { state: 'aging', label: `Updated ${hours} h ago` };
  if (hours < 48) return { state: 'stale', label: `Forecast is ${hours} h old` };
  return { state: 'stale', label: `Forecast is ${Math.round(hours / 24)} days old` };
}

export const DATA_SOURCE_LABEL = 'Demo weather';
