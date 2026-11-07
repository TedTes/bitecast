import type { ComponentType } from 'react';
import { externalConfig } from '@/api/config';
import { useAppStore } from '@/store/use-app-store';
import { CachedChartMap } from './cached-chart-map';
import type { LakeMapProps, MapMode } from './types';

/**
 * Map provider boundary.
 *
 * To add production tiles:
 * 1. `npx expo install @maplibre/maplibre-react-native` (or `react-native-maps`) and
 *    add its config plugin in app.json.
 * 2. Create `native-tile-map.tsx` implementing `LakeMapProps` (render `pins` as
 *    markers, call `onSelect`, highlight `selectedId`).
 * 3. Return it from `resolveTileProvider` below.
 *
 * The cached chart always remains the fallback when offline or unconfigured, so pins
 * render on a blank chart background with no network.
 */
function resolveTileProvider(): ComponentType<LakeMapProps> | null {
  if (externalConfig.mapProvider === 'cached' || !externalConfig.mapStyleUrl) return null;
  return null; // No tile SDK bundled yet.
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
