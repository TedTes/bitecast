import type { LakeForecast } from '@bitecast/engine';

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

/** Keep provenance explicit while the cache is showing bundled development data. */
export function forecastSource(forecast: LakeForecast): 'Custom model' | 'Demo weather' {
  return forecast.engineVersion.startsWith('walleye-') ? 'Demo weather' : 'Custom model';
}
