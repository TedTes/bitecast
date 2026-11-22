import type { LakeForecast } from '@bitecast/engine';
import { forecastSource } from './forecast-metadata';

/**
 * Queries start from bundled demo data so a screen can always render. Once cloud forecasts are
 * connected that data is only a stand-in and must never be presented as a lake’s score.
 */
export function publishedForecast(forecast: LakeForecast | undefined, cloudConnected: boolean): LakeForecast | undefined {
  if (!forecast?.hours.length) return undefined;
  return cloudConnected && forecastSource(forecast) === 'Demo weather' ? undefined : forecast;
}
