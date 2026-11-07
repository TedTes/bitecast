import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import { externalConfig } from './config';

type BiteCastClient = SupabaseClient<any, 'bitecast'>;
let client: BiteCastClient | null | undefined;
let refreshListenerInstalled = false;
let sessionRequest: Promise<Session | null> | null = null;

export function getSupabase(): BiteCastClient | null {
  if (client !== undefined) return client;
  if (!externalConfig.supabaseUrl || !externalConfig.supabaseAnonKey) {
    client = null;
    return client;
  }

  client = createClient(externalConfig.supabaseUrl, externalConfig.supabaseAnonKey, {
    db: { schema: 'bitecast' },
    auth: {
      ...(Platform.OS === 'web' ? {} : { storage: AsyncStorage }),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  });

  if (Platform.OS !== 'web' && !refreshListenerInstalled) {
    refreshListenerInstalled = true;
    AppState.addEventListener('change', (state) => {
      if (!client) return;
      if (state === 'active') client.auth.startAutoRefresh();
      else client.auth.stopAutoRefresh();
    });
  }

  return client ?? null;
}

/** Creates the anonymous cloud identity used by RLS without blocking offline use. */
export async function ensureAnonymousSession() {
  if (sessionRequest) return sessionRequest;
  const supabase = getSupabase();
  if (!supabase) return null;
  sessionRequest = (async () => {
    const { data: current, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    if (current.session) return current.session;
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
    return data.session;
  })();
  try {
    return await sessionRequest;
  } finally {
    sessionRequest = null;
  }
}
