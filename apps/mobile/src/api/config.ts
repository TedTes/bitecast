export const externalConfig = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '', supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  revenueCatIosKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '', revenueCatAndroidKey: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '',
  posthogKey: process.env.EXPO_PUBLIC_POSTHOG_KEY ?? '', sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? '',
  /** 'cached' (code-native fallback), 'maplibre' or 'react-native-maps'. */
  mapProvider: (process.env.EXPO_PUBLIC_MAP_PROVIDER ?? 'cached') as 'cached' | 'maplibre' | 'react-native-maps',
  mapStyleUrl: process.env.EXPO_PUBLIC_MAP_STYLE_URL ?? '',
  termsUrl: process.env.EXPO_PUBLIC_TERMS_URL ?? '', privacyUrl: process.env.EXPO_PUBLIC_PRIVACY_URL ?? '',
};
export const integrationsReady = Boolean(externalConfig.supabaseUrl && externalConfig.supabaseAnonKey);
