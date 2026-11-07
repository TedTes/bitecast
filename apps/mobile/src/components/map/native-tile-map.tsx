import { useMemo, useRef, type ComponentType } from 'react';
import { Platform, StyleSheet, TurboModuleRegistry, View } from 'react-native';
import Constants from 'expo-constants';
import type MapViewType from 'react-native-maps';
import type { Region } from 'react-native-maps';
import { colors, radius, scoreBand, scoreBands } from '@/constants/theme';
import { T } from '../ui';
import type { LakeMapProps, MapLakePin } from './types';

type MapsModule = typeof import('react-native-maps');

/**
 * Real basemap (Apple Maps on iOS, Google Maps on Android) behind the LakeMap boundary.
 * Returns null — so the offline chart is used — when the native module isn't in this build
 * (e.g. a dev client built before react-native-maps was added), on web, or on Android
 * without a Google Maps key.
 */
export function loadNativeTileMap(): ComponentType<LakeMapProps> | null {
  if (Platform.OS === 'web') return null;
  if (!TurboModuleRegistry.get('RNMapsAirModule')) return null;
  if (Platform.OS === 'android' && !Constants.expoConfig?.extra?.mapsAndroidConfigured) return null;
  try {
    // Lazy so builds without the native module never evaluate it.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const maps = require('react-native-maps') as MapsModule;
    return createNativeMap(maps);
  } catch {
    return null;
  }
}

function regionFor(pins: MapLakePin[]): Region {
  const lats = pins.map((p) => p.latitude);
  const lons = pins.map((p) => p.longitude);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLon = Math.min(...lons), maxLon = Math.max(...lons);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLon + maxLon) / 2,
    latitudeDelta: Math.max(1, (maxLat - minLat) * 1.5),
    longitudeDelta: Math.max(1, (maxLon - minLon) * 1.3),
  };
}

function createNativeMap(maps: MapsModule): ComponentType<LakeMapProps> {
  const MapView = maps.default;
  const { Marker } = maps;

  return function NativeTileMap({ pins, selectedId, onSelect }: LakeMapProps) {
    const ref = useRef<MapViewType>(null);
    const initialRegion = useMemo(() => regionFor(pins), [pins]);
    const fit = () =>
      ref.current?.fitToCoordinates(
        pins.map((pin) => ({ latitude: pin.latitude, longitude: pin.longitude })),
        { edgePadding: { top: 56, right: 44, bottom: 72, left: 44 }, animated: false },
      );

    return (
      <MapView
        ref={ref}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        onMapReady={fit}
        mapType={Platform.OS === 'ios' ? 'mutedStandard' : 'standard'}
        showsPointsOfInterests={false}
        showsBuildings={false}
        showsTraffic={false}
        pitchEnabled={false}
        rotateEnabled={false}
        toolbarEnabled={false}
        userInterfaceStyle="light"
        accessibilityLabel="Map of covered lakes"
      >
        {pins.map((pin) => {
          const active = pin.id === selectedId;
          const band = scoreBands[scoreBand(pin.score)];
          return (
            <Marker
              // Re-key on selection so the static snapshot redraws without tracking every frame.
              key={`${pin.id}-${active ? 'on' : 'off'}`}
              coordinate={{ latitude: pin.latitude, longitude: pin.longitude }}
              anchor={{ x: 0.5, y: 1 }}
              tracksViewChanges={false}
              zIndex={active ? 10 : 1}
              onPress={() => onSelect(pin.id)}
              accessibilityLabel={`${pin.name}, best bite score ${pin.score}, ${band.label}${pin.followed ? ', followed' : ''}`}
            >
              <View style={styles.pinWrap}>
                <View style={[styles.pin, active && styles.pinActive]}>
                  <View style={[styles.stripe, { backgroundColor: active ? band.onDark : band.color }]} />
                  <View style={{ alignItems: 'center', paddingHorizontal: 6 }}>
                    <T variant="numeralS" color={active ? colors.onDark : colors.ink} maxFontSizeMultiplier={1.1}>{pin.score}</T>
                    <T variant="caption" weight="700" color={active ? band.onDark : band.color} style={styles.band} maxFontSizeMultiplier={1.1}>{band.label.toUpperCase()}</T>
                  </View>
                  {pin.followed ? <View style={styles.followDot} /> : null}
                </View>
                <View style={[styles.pointer, active && { borderTopColor: colors.deep }]} />
              </View>
            </Marker>
          );
        })}
      </MapView>
    );
  };
}

const styles = StyleSheet.create({
  pinWrap: { alignItems: 'center' },
  pin: { flexDirection: 'row', alignItems: 'center', minHeight: 40, minWidth: 50, borderRadius: radius.sm, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.lineStrong, overflow: 'hidden' },
  pinActive: { backgroundColor: colors.deep, borderColor: colors.deep },
  stripe: { width: 5, alignSelf: 'stretch' },
  band: { fontSize: 9, lineHeight: 11 },
  followDot: { position: 'absolute', top: 4, right: 4, width: 6, height: 6, borderRadius: 3, backgroundColor: colors.sunrise },
  pointer: { width: 0, height: 0, borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 7, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: colors.lineStrong },
});
