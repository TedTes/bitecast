import * as SQLite from 'expo-sqlite';
import type { AlertPreference, AppSettings, CatchLog, LakeRequest } from '@/types/app';

export type LocalAppState = {
  onboardingComplete: boolean;
  region: string;
  followedLakeIds: string[];
  settings: AppSettings;
  isPro: boolean;
  alerts: AlertPreference[];
};

let database: SQLite.SQLiteDatabase | null = null;
async function getDatabase() {
  if (database) return database;
  database = await SQLite.openDatabaseAsync('bitecast.db');
  await database.execAsync(`PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS catch_logs_local (id TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL, sync_state TEXT NOT NULL, client_updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS settings_local (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS lake_requests_local (id TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL);`);
  return database;
}
export async function loadCatchLogs(): Promise<CatchLog[]> {
  try {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{ payload: string }>('SELECT payload FROM catch_logs_local ORDER BY client_updated_at DESC');
    return rows.map((row) => JSON.parse(row.payload) as CatchLog);
  } catch { return []; }
}
export async function saveCatchLog(log: CatchLog) {
  const db = await getDatabase();
  await db.runAsync('INSERT OR REPLACE INTO catch_logs_local (id, payload, sync_state, client_updated_at) VALUES (?, ?, ?, ?)', log.id, JSON.stringify(log), log.syncState, log.clientUpdatedAt);
}
export async function removeAllLocalData() {
  const db = await getDatabase();
  await db.execAsync('DELETE FROM catch_logs_local; DELETE FROM lake_requests_local;');
}

export async function loadAppState(): Promise<LocalAppState | null> {
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings_local WHERE key = ?', 'app_state');
    return row ? JSON.parse(row.value) as LocalAppState : null;
  } catch {
    return null;
  }
}

export async function saveAppState(state: LocalAppState) {
  const db = await getDatabase();
  await db.runAsync('INSERT OR REPLACE INTO settings_local (key, value) VALUES (?, ?)', 'app_state', JSON.stringify(state));
}
export async function saveLakeRequest(request: LakeRequest) {
  const db = await getDatabase();
  await db.runAsync('INSERT OR REPLACE INTO lake_requests_local (id, payload, created_at) VALUES (?, ?, ?)', request.id, JSON.stringify(request), request.createdAt);
}
export async function loadLakeRequests(): Promise<LakeRequest[]> {
  try {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{ payload: string }>('SELECT payload FROM lake_requests_local ORDER BY created_at DESC');
    return rows.map((row) => JSON.parse(row.payload) as LakeRequest);
  } catch { return []; }
}
