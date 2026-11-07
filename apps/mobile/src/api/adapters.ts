import { Platform } from 'react-native';
import type { CatchLog, LakeRequest } from '@/types/app';
import { externalConfig, integrationsReady } from './config';

/**
 * External-service boundary. Every function here is a placeholder until credentials
 * are configured; screens must only talk to services through this module.
 */

export const analytics = { capture: (_event: string, _properties?: Record<string, unknown>) => undefined };

/* ── Sync (Supabase) ── Called only AFTER a SQLite write has succeeded. */
export async function syncCatchLogs(_logs: CatchLog[]): Promise<{ syncedIds: string[] }> {
  return { syncedIds: [] };
}

/* ── Purchases (RevenueCat) ── */
export type PlanId = 'annual' | 'monthly';
export type Offering = { id: PlanId; title: string; price: string; period: string; perMonth?: string; trialDays: number; isPlaceholder: boolean };
export type PurchaseResult = { status: 'success' | 'cancelled' | 'pending' | 'error'; message?: string };

export const purchasesConfigured = Boolean(Platform.OS === 'ios' ? externalConfig.revenueCatIosKey : externalConfig.revenueCatAndroidKey);

/** Returns store products. Until RevenueCat is connected these are clearly-marked placeholders. */
export async function getOfferings(): Promise<Offering[]> {
  return [
    { id: 'annual', title: 'Annual', price: '$—.— / year', period: 'year', perMonth: 'Price set in store', trialDays: 7, isPlaceholder: true },
    { id: 'monthly', title: 'Monthly', price: '$—.— / month', period: 'month', trialDays: 7, isPlaceholder: true },
  ];
}

/** Development placeholder: simulates a successful store purchase so flows can be exercised. */
export async function purchasePlan(_plan: PlanId): Promise<PurchaseResult> {
  await new Promise((resolve) => setTimeout(resolve, 900));
  if (!purchasesConfigured) return { status: 'success', message: 'Development purchase (no store connected).' };
  return { status: 'error', message: 'RevenueCat purchase is not wired yet.' };
}

export async function restorePurchases(): Promise<boolean> {
  await new Promise((resolve) => setTimeout(resolve, 700));
  return false;
}

/* ── Identity linking (Supabase Auth linkIdentity) ── */
export type AuthProvider = 'apple' | 'google';
export type LinkResult = { status: 'linked' | 'cancelled' | 'conflict' | 'not_configured' | 'error'; message?: string };

export async function linkIdentity(_provider: AuthProvider): Promise<LinkResult> {
  await new Promise((resolve) => setTimeout(resolve, 600));
  if (!integrationsReady) return { status: 'not_configured' };
  return { status: 'error', message: 'Identity linking is not wired yet.' };
}

/* ── Notifications (Expo push) ── */
export type NotificationPermission = 'granted' | 'denied' | 'undetermined';
let permission: NotificationPermission = 'undetermined';

export async function getNotificationPermission(): Promise<NotificationPermission> {
  return permission;
}
/** Placeholder: production should call expo-notifications requestPermissionsAsync. */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  permission = 'granted';
  return permission;
}

/* ── Lake requests ── */
export async function submitLakeRequest(_request: LakeRequest): Promise<{ status: 'sent' | 'queued' }> {
  if (!integrationsReady) return { status: 'queued' };
  return { status: 'queued' };
}

/* ── Connectivity ── Replace with @react-native-community/netinfo when added. */
export type Connectivity = 'online' | 'offline' | 'unknown';
export function subscribeConnectivity(_listener: (state: Connectivity) => void): () => void {
  return () => undefined;
}

/** Status of each integration for the in-app developer panel. */
export const integrationStatus = [
  { name: 'Supabase sync & auth', ready: integrationsReady },
  { name: 'RevenueCat purchases', ready: purchasesConfigured },
  { name: 'PostHog analytics', ready: Boolean(externalConfig.posthogKey) },
  { name: 'Sentry crash reporting', ready: Boolean(externalConfig.sentryDsn) },
  { name: 'Map tiles', ready: Boolean(externalConfig.mapStyleUrl) },
];
