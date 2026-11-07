/**
 * Extends app.json. Injects the Google Maps key for Android at build time from the
 * GOOGLE_MAPS_ANDROID_API_KEY environment variable (EAS secret / local env). iOS uses
 * Apple Maps and needs no key. Without a key, Android falls back to the offline chart.
 */
module.exports = ({ config }) => {
  const androidKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
  return {
    ...config,
    plugins: [...(config.plugins ?? []), ['react-native-maps', androidKey ? { androidGoogleMapsApiKey: androidKey } : {}]],
    extra: { ...(config.extra ?? {}), mapsAndroidConfigured: Boolean(androidKey) },
  };
};
