import { computeForecast, createDemoWeather, type LakeForecast, type Season } from '@bitecast/engine';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { ensureAnonymousSession, getSupabase } from '@/api/supabase';
import { integrationsReady } from '@/api/config';
import { loadForecastCache, saveForecastCache } from '@/db/database';
import { lakes } from './lakes';

export { forecastSource, freshness, type Freshness } from '@/features/forecast-metadata';

const anchor = new Date();
anchor.setMinutes(0, 0, 0);

/** Hot memory layer backed by the persistent device forecast cache. */
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
 * Network refresh boundary. Configured builds read published DawnBite forecasts
 * from Supabase; unconfigured development builds retain deterministic demo data.
 */
async function fetchForecast(lakeId: string, season: Season): Promise<LakeForecast> {
  const key = `${lakeId}:${season}`;
  const persisted = await loadForecastCache(key);
  if (persisted) cache.set(key, persisted);
  if (!integrationsReady) return persisted ?? getForecast(lakeId, season);
  const supabase = getSupabase();
  if (!supabase) return persisted ?? getForecast(lakeId, season);
  try {
    await ensureAnonymousSession();
    const { data: lake, error: lakeError } = await supabase.from('lakes').select('id').eq('slug', lakeId).single();
    if (lakeError) throw lakeError;
    const now = new Date();
    now.setHours(now.getHours() - 1);
    const [{ data: rawHours, error: hourError }, { data: rawWindows, error: windowError }] = await Promise.all([
      supabase.from('forecast_hourly').select('ts,score,light,components,reasons,confidence,engine_version,computed_at,model_family,prediction_granularity,time_precision')
        .eq('lake_id', lake.id).eq('species', 'walleye').eq('season_mode', season)
        .gte('ts', now.toISOString()).order('ts').limit(24 * 7),
      supabase.from('forecast_windows').select('id,start_ts,end_ts,peak_score,reasons,confidence,tactics_text,engine_version,computed_at,model_family,prediction_granularity,time_precision')
        .eq('lake_id', lake.id).eq('species', 'walleye').eq('season_mode', season)
        .gte('end_ts', now.toISOString()).order('start_ts'),
    ]);
    if (hourError) throw hourError;
    if (windowError) throw windowError;
    if (!rawHours?.length) throw new Error('No custom-model forecast is available for this lake yet.');
    const hours = rawHours.map((row) => {
      const components = (row.components ?? {}) as Record<string, number | null>;
      return {
        ts: row.ts as string,
        score: row.score as number,
        light: row.light as number,
        transition: 0,
        reasons: row.reasons as string[],
        confidence: row.confidence as 'High' | 'Medium' | 'Low',
        predictionGranularity: row.prediction_granularity as 'hour' | 'time_block',
        timePrecision: row.time_precision as 'exact' | 'time_block' | 'day' | 'unknown',
        sunElevation: components.solar_elevation_deg ?? 0,
        cloudPct: components.cloud_pct ?? 0,
        windKmh: components.wind_kmh ?? 0,
        precipitationMm: components.precipitation_mm ?? 0,
        pressureHpa: components.pressure_hpa ?? 0,
        moonIllumination: components.moon_illumination ?? 0,
        fetchedAt: row.computed_at as string,
      };
    });
    const windows = (rawWindows ?? []).map((row) => ({
      id: row.id as string,
      start: row.start_ts as string,
      end: row.end_ts as string,
      peakScore: row.peak_score as number,
      reasons: row.reasons as string[],
      confidence: row.confidence as 'High' | 'Medium' | 'Low',
      predictionGranularity: row.prediction_granularity as 'hour' | 'time_block',
      timePrecision: row.time_precision as 'exact' | 'time_block' | 'day' | 'unknown',
      depth: 'mid' as const,
      tactics: row.tactics_text as string,
      hours: hours.filter((hour) => hour.ts >= (row.start_ts as string) && hour.ts < (row.end_ts as string)),
    }));
    const forecast: LakeForecast = {
      lakeId,
      engineVersion: rawHours[0].engine_version as string,
      computedAt: rawHours[0].computed_at as string,
      modelFamily: rawHours[0].model_family as 'hourly' | 'trip_broad',
      predictionGranularity: rawHours[0].prediction_granularity as 'hour' | 'time_block',
      hours,
      windows,
    };
    await saveForecastCache(key, forecast);
    cache.set(key, forecast);
    return forecast;
  } catch (error) {
    if (persisted) return persisted;
    throw error;
  }
}

/** Cache-first forecast: renders cached data immediately, refreshes in the background. */
export const forecastQuery = (lakeId: string, season: Season) =>
  queryOptions({
    queryKey: ['forecast', lakeId, season],
    queryFn: () => fetchForecast(lakeId, season),
    initialData: () => getForecast(lakeId, season),
    // Bundled demo data lets the screen render offline, but must be stale immediately
    // when cloud integrations exist so it cannot suppress the first real refresh.
    initialDataUpdatedAt: () => integrationsReady
      ? 0
      : new Date(getForecast(lakeId, season).computedAt).getTime(),
    staleTime: 15 * 60_000,
  });

export function useForecast(lakeId: string, season: Season) {
  return useQuery(forecastQuery(lakeId, season));
}

export const DATA_SOURCE_LABEL = integrationsReady ? 'Custom model pipeline' : 'Demo weather';
