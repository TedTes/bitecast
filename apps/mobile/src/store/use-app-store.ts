import { create } from 'zustand';
import type { Account, AlertPreference, AppSettings, CatchLog, LakeRequest } from '@/types/app';
import { loadCatchLogs, loadLakeRequests, removeAllLocalData, saveCatchLog, saveLakeRequest } from '@/db/database';
import { submitLakeRequest, syncCatchLogs, type Connectivity } from '@/api/adapters';

type AppState = {
  hydrated: boolean; onboardingComplete: boolean; region: string; followedLakeIds: string[]; settings: AppSettings; isPro: boolean;
  catchLogs: CatchLog[]; alerts: AlertPreference[]; lakeRequests: LakeRequest[]; account: Account; connectivity: Connectivity;
  /** Id + time of the most recent successful local save, used for “Saved” confirmation. */
  lastSaved: { id: string; at: number } | null;
  hydrate: () => Promise<void>; setSeason: (season: AppSettings['season']) => void;
  setRegion: (region: string) => void; toggleLake: (lakeId: string) => void; completeOnboarding: (isPro?: boolean) => void;
  setPro: (isPro: boolean) => void;
  /** SQLite first: resolves only after the local write succeeds; throws if it fails. */
  addCatchLog: (log: CatchLog) => Promise<void>;
  syncPending: () => Promise<void>;
  setUnits: (units: AppSettings['units']) => void;
  setAlertsEnabled: (enabled: boolean) => void; updateAlert: (preference: AlertPreference) => void;
  setQuietHours: (start: string, end: string) => void;
  addLakeRequest: (request: Omit<LakeRequest, 'status'>) => Promise<LakeRequest>;
  setAccount: (account: Account) => void; setConnectivity: (connectivity: Connectivity) => void;
  clearLocalData: () => Promise<void>;
};
export const useAppStore = create<AppState>((set, get) => ({
  hydrated: false, onboardingComplete: false, region: 'All Ontario', followedLakeIds: ['lake-erie', 'bay-of-quinte'],
  settings: { season: 'open_water', units: 'metric', quietStart: '22:00', quietEnd: '06:00', alertsEnabled: true },
  isPro: false, catchLogs: [], alerts: [], lakeRequests: [], account: { status: 'anonymous' }, connectivity: 'unknown', lastSaved: null,
  hydrate: async () => {
    const [catchLogs, lakeRequests] = await Promise.all([loadCatchLogs(), loadLakeRequests()]);
    set({ catchLogs, lakeRequests, hydrated: true });
  },
  setSeason: (season) => set((state) => ({ settings: { ...state.settings, season } })), setRegion: (region) => set({ region }),
  toggleLake: (lakeId) => set((state) => ({ followedLakeIds: state.followedLakeIds.includes(lakeId) ? state.followedLakeIds.filter((id) => id !== lakeId) : state.followedLakeIds.length < 5 ? [...state.followedLakeIds, lakeId] : state.followedLakeIds })),
  completeOnboarding: (isPro = false) => set({ onboardingComplete: true, isPro }), setPro: (isPro) => set({ isPro }),
  addCatchLog: async (log) => {
    await saveCatchLog(log);
    set((state) => ({ catchLogs: [log, ...state.catchLogs.filter((item) => item.id !== log.id)], lastSaved: { id: log.id, at: Date.now() } }));
    get().syncPending().catch(() => undefined);
  },
  syncPending: async () => {
    const pending = get().catchLogs.filter((log) => log.syncState !== 'synced');
    if (!pending.length) return;
    const { syncedIds } = await syncCatchLogs(pending);
    if (!syncedIds.length) return;
    const updated = get().catchLogs.map((log) => (syncedIds.includes(log.id) ? { ...log, syncState: 'synced' as const } : log));
    await Promise.all(updated.filter((log) => syncedIds.includes(log.id)).map(saveCatchLog));
    set({ catchLogs: updated });
  },
  setUnits: (units) => set((state) => ({ settings: { ...state.settings, units } })),
  setAlertsEnabled: (alertsEnabled) => set((state) => ({ settings: { ...state.settings, alertsEnabled } })),
  updateAlert: (preference) => set((state) => ({ alerts: [...state.alerts.filter((item) => item.lakeId !== preference.lakeId), preference] })),
  setQuietHours: (quietStart, quietEnd) => set((state) => ({ settings: { ...state.settings, quietStart, quietEnd } })),
  addLakeRequest: async (draft) => {
    const queued: LakeRequest = { ...draft, status: 'queued' };
    await saveLakeRequest(queued);
    const result = await submitLakeRequest(queued).catch(() => ({ status: 'queued' as const }));
    const final: LakeRequest = { ...queued, status: result.status };
    if (final.status !== queued.status) await saveLakeRequest(final);
    set((state) => ({ lakeRequests: [final, ...state.lakeRequests.filter((item) => item.id !== final.id)] }));
    return final;
  },
  setAccount: (account) => set({ account }), setConnectivity: (connectivity) => set({ connectivity }),
  clearLocalData: async () => {
    await removeAllLocalData();
    set({ catchLogs: [], lakeRequests: [], lastSaved: null });
  },
}));
