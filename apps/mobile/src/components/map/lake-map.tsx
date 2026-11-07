import type { ComponentType } from 'react';
import { externalConfig } from '@/api/config';
import { useAppStore } from '@/store/use-app-store';
import { CachedChartMap } from './cached-chart-map';
import { loadNativeTileMap } from './native-tile-map';
import type { LakeMapProps, MapMode } from './types';

/**
 * Map provider boundary. Screens render <LakeMap>; the provider is chosen here:
 * - `react-native-maps` (default): Apple Maps on iOS, Google Maps on Android (needs
 *   GOOGLE_MAPS_ANDROID_API_KEY at build time, see app.config.js).
 * - `cached`: the code-native offline chart only.
 * The cached chart is always the fallback when offline, on web, or when the native map
 * module isn't in this build — pins still render on a plain chart with no network.
 */
function resolveTileProvider(): ComponentType<LakeMapProps> | null {
  if (externalConfig.mapProvider === 'cached') return null;
  return loadNativeTileMap();
}

const TileProvider = resolveTileProvider();

export function useMapMode(): MapMode {
  const offline = useAppStore((state) => state.connectivity === 'offline');
  return !offline && TileProvider ? 'tiles' : 'cached';
}

export function LakeMap(props: LakeMapProps) {
  const mode = useMapMode();
  if (mode === 'tiles' && TileProvider) return <TileProvider {...props} />;
  return <CachedChartMap {...props} />;
}

export type { LakeMapProps, MapLakePin, MapMode } from './types';
