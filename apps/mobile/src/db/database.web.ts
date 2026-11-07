import type { CatchLog, LakeRequest } from '@/types/app';

const storageKey = 'bitecast.catchLogs';
const requestKey = 'bitecast.lakeRequests';

export async function loadCatchLogs(): Promise<CatchLog[]> {
  if (typeof localStorage === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(storageKey) ?? '[]') as CatchLog[]; } catch { return []; }
}

export async function saveCatchLog(log: CatchLog) {
  if (typeof localStorage === 'undefined') return;
  const current = await loadCatchLogs();
  localStorage.setItem(storageKey, JSON.stringify([log, ...current.filter((item) => item.id !== log.id)]));
}

export async function removeAllLocalData() {
  if (typeof localStorage !== 'undefined') { localStorage.removeItem(storageKey); localStorage.removeItem(requestKey); }
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
