import { useQueries } from '@tanstack/react-query';
import type { ForecastWindow, LakeForecast, Season } from '@bitecast/engine';
import * as SunCalc from 'suncalc';
import { create } from 'zustand';
import { hoursFromNow, upcomingWindows } from '@/components/forecast';
import { forecastQuery } from '@/data/forecasts';
import { lakeById } from '@/data/lakes';
import { useConditionResolver } from '@/features/lake-season';
import { skyPalette } from '@/features/sky';
import { useAppStore } from '@/store/use-app-store';
import type { Lake } from '@/types/app';

/*
 * One sky for the whole app: Today’s scene and every shoreline header are lit by the same lake,
 * clock and forecast hour, so they all turn to night together.
 */

export type LakeData = { lake: Lake; season: Season; forecast: LakeForecast; updatedAt: number; next?: ForecastWindow; live: boolean };

/** Southern Ontario: lights the sky before any lake is followed. */
const DEFAULT_PLACE = { latitude: 44.2, longitude: -78.4 };

/** The window to act on for a lake: one open now, else the soonest upcoming. */
function actionable(windows: ForecastWindow[], now: number) {
  const upcoming = upcomingWindows(windows, now);
  const open = upcoming.find((w) => new Date(w.start).getTime() <= now);
  return { next: open ?? upcoming[0], live: Boolean(open) };
}

/** Followed lakes as Today ranks them: open windows first, then by strength of the next window. */
export function useRankedLakes(now: number) {
  const ids = useAppStore((state) => state.followedLakeIds);
  const resolve = useConditionResolver();
  const seasons = ids.map((id) => resolve(id).season);
  const queries = useQueries({ queries: ids.map((id, index) => forecastQuery(id, seasons[index])) });
  const data: LakeData[] = queries
    .flatMap((query, index) => (query.data ? [{ lake: lakeById(ids[index]), season: seasons[index], forecast: query.data, updatedAt: query.dataUpdatedAt, ...actionable(query.data.windows, now) }] : []))
    .sort((a, b) => Number(b.live) - Number(a.live) || (b.next?.peakScore ?? 0) - (a.next?.peakScore ?? 0));
  return { ids, seasons, queries, data };
}

/** The development sky slider’s time, shared so that headers follow it too. */
export const useSkyPreviewTime = create<{ time: number | null; setTime: (time: number | null) => void }>((set) => ({
  time: null,
  setTime: (time) => set({ time }),
}));

export type SceneSky = ReturnType<typeof useSceneSky>;

/** The sky over a lake: light from the sun’s altitude, weather from the current forecast hour. */
export function useSceneSky(subject: Pick<LakeData, 'lake' | 'season' | 'forecast'> | undefined, now: number) {
  const previewTime = useSkyPreviewTime((state) => state.time);
  const time = (__DEV__ ? previewTime : null) ?? now;
  const place = subject?.lake ?? DEFAULT_PLACE;
  const altitude = SunCalc.getPosition(new Date(time), place.latitude, place.longitude).altitude; // degrees
  const hour = subject ? hoursFromNow(subject.forecast.hours, now)[0] : undefined;
  const weather = { cloudPct: hour?.cloudPct ?? 20, windKmh: hour?.windKmh ?? 8, rainMm: hour?.precipitationMm ?? 0 };
  const ice = subject?.season === 'ice';
  return { time, place, altitude, hour, weather, ice, palette: skyPalette(altitude, weather.cloudPct, ice) };
}
