import type { LakeForecast } from '@bitecast/engine';
import type { CatchLog, LakeRequest } from '@/types/app';
import { normalizeCatchLog } from '@/features/catch-log';

const storageKey = 'bitecast.catchLogs';
const requestKey = 'bitecast.lakeRequests';
const forecastKey = 'bitecast.forecast.';

export async function loadCatchLogs(): Promise<CatchLog[]> {
  if (typeof localStorage === 'undefined') return [];
  try { return (JSON.parse(localStorage.getItem(storageKey) ?? '[]') as CatchLog[]).map(normalizeCatchLog); } catch { return []; }
}

export async function saveCatchLog(log: CatchLog) {
  if (typeof localStorage === 'undefined') return;
  const current = await loadCatchLogs();
  localStorage.setItem(storageKey, JSON.stringify([log, ...current.filter((item) => item.id !== log.id)]));
}

export async function removeAllLocalData() {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(storageKey);
  localStorage.removeItem(requestKey);
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(forecastKey)) localStorage.removeItem(key);
  }
}

export async function loadForecastCache(key: string): Promise<LakeForecast | null> {
  if (typeof localStorage === 'undefined') return null;
  try {
    const value = localStorage.getItem(`${forecastKey}${key}`);
    return value ? JSON.parse(value) as LakeForecast : null;
  } catch {
    return null;
  }
}

export async function saveForecastCache(key: string, forecast: LakeForecast) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(`${forecastKey}${key}`, JSON.stringify(forecast));
}

export async function loadLakeRequests(): Promise<LakeRequest[]> {
  if (typeof localStorage === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(requestKey) ?? '[]') as LakeRequest[]; } catch { return []; }
}

export async function saveLakeRequest(request: LakeRequest) {
  if (typeof localStorage === 'undefined') return;
  const current = await loadLakeRequests();
  localStorage.setItem(requestKey, JSON.stringify([request, ...current.filter((item) => item.id !== request.id)]));
}
