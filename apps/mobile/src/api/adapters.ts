import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import * as Network from 'expo-network';
import * as Notifications from 'expo-notifications';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import type { Account, AlertPreference, AppSettings, CatchLog, LakeRequest } from '@/types/app';
import { externalConfig, integrationsReady } from './config';
import { ensureAnonymousSession, getSupabase } from './supabase';

/**
 * External-service boundary. Every function here is a placeholder until credentials
 * are configured; screens must only talk to services through this module.
 */

export const analytics = { capture: (_event: string, _properties?: Record<string, unknown>) => undefined };

/* ── Sync (Supabase) ── Called only AFTER a SQLite write has succeeded. */
export async function syncCatchLogs(logs: CatchLog[]): Promise<{ syncedIds: string[] }> {
  const supabase = getSupabase();
  if (!supabase || !logs.length) return { syncedIds: [] };
  const session = await ensureAnonymousSession();
  if (!session) return { syncedIds: [] };

  const lakeSlugs = [...new Set(logs.map((log) => log.lakeId))];
  const { data: lakes, error: lakeError } = await supabase.from('lakes').select('id, slug').in('slug', lakeSlugs);
  if (lakeError) throw lakeError;
  const lakeIds = new Map((lakes ?? []).map((lake) => [lake.slug as string, lake.id as string]));
  const syncable = logs.filter((log) => lakeIds.has(log.lakeId) && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(log.id));
  if (!syncable.length) return { syncedIds: [] };

  const rows = syncable.map((log) => ({
    id: log.id,
    user_id: session.user.id,
    lake_id: lakeIds.get(log.lakeId),
    caught_at: log.caughtAt,
    caught: log.caught,
    count: log.count,
    length_cm: log.lengthCm ?? null,
    depth_m: log.depthM ?? null,
    bait: log.bait,
    method: log.method,
    clarity: log.clarity,
    notes: log.notes,
    conditions: { ...log.conditions, lightCondition: log.lightCondition },
    score_at_time: log.scoreAtTime,
    engine_version: '1.0.0',
    client_updated_at: log.clientUpdatedAt,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from('catch_logs').upsert(rows, { onConflict: 'id' });
  if (error) throw error;
  return { syncedIds: syncable.map((log) => log.id) };
}

export async function syncPreferences(input: {
  settings: AppSettings;
  followedLakeIds: string[];
  alerts: AlertPreference[];
  region: string;
}): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  const session = await ensureAnonymousSession();
  if (!session) return;
  const { error: profileError } = await supabase.from('profiles').upsert({
    user_id: session.user.id,
    units: input.settings.units,
    season_mode: input.settings.season,
    region: input.region,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Toronto',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
  if (profileError) throw profileError;

  const { data: lakes, error: lakeError } = await supabase.from('lakes').select('id,slug').in('slug', input.followedLakeIds);
  if (lakeError) throw lakeError;
  const remoteLakeIds = (lakes ?? []).map((lake) => lake.id as string);
  const alertByLake = new Map(input.alerts.map((alert) => [alert.lakeId, alert]));
  if (lakes?.length) {
    const rows = lakes.map((lake) => {
      const alert = alertByLake.get(lake.slug as string);
      return {
        user_id: session.user.id,
        lake_id: lake.id,
        alert_enabled: input.settings.alertsEnabled && (alert?.enabled ?? true),
        threshold: alert?.threshold ?? 70,
        lead_minutes: alert?.leadMinutes ?? 120,
        quiet_start: input.settings.quietStart,
        quiet_end: input.settings.quietEnd,
      };
    });
    const { error } = await supabase.from('follows').upsert(rows, { onConflict: 'user_id,lake_id' });
    if (error) throw error;
  }
  const { data: existing, error: existingError } = await supabase.from('follows').select('lake_id').eq('user_id', session.user.id);
  if (existingError) throw existingError;
  const removed = (existing ?? []).map((row) => row.lake_id as string).filter((id) => !remoteLakeIds.includes(id));
  if (removed.length) {
    const { error } = await supabase.from('follows').delete().eq('user_id', session.user.id).in('lake_id', removed);
    if (error) throw error;
  }
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

export async function getCloudAccount(): Promise<Account> {
  if (!integrationsReady) return { status: 'anonymous' };
  const session = await ensureAnonymousSession();
  const linked = session?.user.identities?.find((identity) => identity.provider === 'apple' || identity.provider === 'google');
  return linked ? { status: 'linked', provider: linked.provider as AuthProvider } : { status: 'anonymous' };
}

export async function linkIdentity(provider: AuthProvider): Promise<LinkResult> {
  if (!integrationsReady) return { status: 'not_configured' };
  const supabase = getSupabase();
  if (!supabase) return { status: 'not_configured' };
  try {
    await ensureAnonymousSession();
    const redirectTo = Linking.createURL('auth/callback');
    const { data, error } = await supabase.auth.linkIdentity({ provider, options: { redirectTo, skipBrowserRedirect: true } });
    if (error) throw error;
    if (!data.url) return { status: 'error', message: 'The sign-in provider did not return a link.' };
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success') return { status: 'cancelled' };
    const code = new URL(result.url).searchParams.get('code');
    if (!code) return { status: 'error', message: 'The sign-in response did not include an authorization code.' };
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) throw exchangeError;
    return { status: 'linked' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not link this account.';
    if (/already|identity.*exists|conflict/i.test(message)) return { status: 'conflict', message };
    return { status: 'error', message };
  }
}

export async function deleteCloudAccount(): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Cloud sync is not configured in this build.');
  const { error } = await supabase.functions.invoke('bitecast-delete-account', { body: {} });
  if (error) throw error;
  await supabase.auth.signOut({ scope: 'local' });
}

/* ── Notifications (Expo push) ── */
export type NotificationPermission = 'granted' | 'denied' | 'undetermined';
export async function getNotificationPermission(): Promise<NotificationPermission> {
  const result = await Notifications.getPermissionsAsync();
  return result.status;
}
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  const result = await Notifications.requestPermissionsAsync();
  if (result.status === 'granted') await registerPushToken().catch(() => undefined);
  return result.status;
}

async function registerPushToken() {
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  const supabase = getSupabase();
  if (!projectId || !supabase) return;
  const session = await ensureAnonymousSession();
  if (!session) return;
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  const { error } = await supabase.from('push_tokens').upsert({
    user_id: session.user.id,
    token,
    platform: Platform.OS,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,token' });
  if (error) throw error;
}

/* ── Lake requests ── */
export async function submitLakeRequest(request: LakeRequest): Promise<{ status: 'sent' | 'queued' }> {
  if (!integrationsReady) return { status: 'queued' };
  const supabase = getSupabase();
  const session = await ensureAnonymousSession();
  if (!supabase || !session) return { status: 'queued' };
  const { error } = await supabase.from('lake_requests').insert({
    user_id: session.user.id,
    name: request.name,
    region: request.region,
    notes: request.notes || null,
  });
  if (error) throw error;
  return { status: 'sent' };
}

export type Connectivity = 'online' | 'offline' | 'unknown';
function connectivityFromNetwork(state: Network.NetworkState): Connectivity {
  if (state.isConnected === false || state.isInternetReachable === false) return 'offline';
  if (state.isConnected === true) return 'online';
  return 'unknown';
}
export function subscribeConnectivity(listener: (state: Connectivity) => void): () => void {
  let active = true;
  Network.getNetworkStateAsync().then((state) => {
    if (active) listener(connectivityFromNetwork(state));
  }).catch(() => undefined);
  const subscription = Network.addNetworkStateListener((state) => listener(connectivityFromNetwork(state)));
  return () => { active = false; subscription.remove(); };
}

/** Status of each integration for the in-app developer panel. */
export const integrationStatus = [
  { name: 'Supabase sync & auth', ready: integrationsReady },
  { name: 'RevenueCat purchases', ready: purchasesConfigured },
  { name: 'PostHog analytics', ready: Boolean(externalConfig.posthogKey) },
  { name: 'Sentry crash reporting', ready: Boolean(externalConfig.sentryDsn) },
  { name: 'Map tiles', ready: Boolean(externalConfig.mapStyleUrl) },
];
