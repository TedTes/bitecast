import type { Clarity, Confidence, Season } from '@bitecast/engine';

export type Lake = {
  id: string; name: string; region: string; provinceState: string; latitude: number; longitude: number; clarity: Clarity;
  regulation: { seasonOpen: string; seasonClose: string; limits: string; sourceUrl: string; lastVerified: string };
};
export type CatchLog = {
  id: string; lakeId: string; caughtAt: string; caught: boolean; count: number; lengthCm?: number; depthM?: number;
  bait: string; method: 'jig' | 'troll' | 'tip-up' | 'cast'; clarity: Clarity; notes: string; scoreAtTime: number;
  lightCondition: 'Low light' | 'Mid light' | 'Bright'; conditions: { temperatureC: number; windKmh: number; summary: string };
  syncState: 'pending' | 'synced' | 'error'; clientUpdatedAt: string;
};
export type AlertPreference = { lakeId: string; enabled: boolean; threshold: number; leadMinutes: number };
/** `iceFishing`: whether the angler fishes through the ice at all (enables typical ice mode per lake). */
export type AppSettings = { iceFishing: boolean; units: 'metric' | 'imperial'; quietStart: string; quietEnd: string; alertsEnabled: boolean };
export type ForecastCard = { lakeId: string; score: number; confidence: Confidence; updatedAt: string };
export type LakeRequest = { id: string; name: string; region: string; notes: string; createdAt: string; status: 'queued' | 'sent' };
export type Account = { status: 'anonymous' } | { status: 'linked'; provider: 'apple' | 'google' };
/** Per-lake manual condition; absent = automatic (typical for the lake's latitude and date). */
export type LakeSeasons = Record<string, Season>;
