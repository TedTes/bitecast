import { useEffect, useMemo, useRef, type ComponentType } from 'react';
import { Platform, StyleSheet, TurboModuleRegistry, View } from 'react-native';
import Constants from 'expo-constants';
import type MapViewType from 'react-native-maps';
import type { Region } from 'react-native-maps';
import { colors, elevation, radius, scoreBand, scoreBands, spacing, touch } from '@/constants/theme';
import { shortLakeName } from '@/lib/format';
import { IconButton, T } from '../ui';
import { pinScoreLabel, type LakeMapProps, type MapLakePin } from './types';

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
    const fit = (animated: boolean) =>
      ref.current?.fitToCoordinates(
        pins.map((pin) => ({ latitude: pin.latitude, longitude: pin.longitude })),
        // Pins hang above their coordinate, so the top needs more room.
        { edgePadding: { top: 72, right: 48, bottom: 32, left: 48 }, animated },
      );

    const shown = useRef(selectedId);
    useEffect(() => {
      if (shown.current === selectedId) return;
      shown.current = selectedId;
      const pin = pins.find((item) => item.id === selectedId);
      if (pin) ref.current?.animateCamera({ center: { latitude: pin.latitude, longitude: pin.longitude } }, { duration: 350 });
    }, [selectedId, pins]);

    return (
      <View style={StyleSheet.absoluteFill}>
        <MapView
          ref={ref}
          style={StyleSheet.absoluteFill}
          initialRegion={initialRegion}
          // A frame later, so the map has its final size to fit into.
          onMapReady={() => requestAnimationFrame(() => fit(false))}
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
            const band = pin.score === null ? null : scoreBands[scoreBand(pin.score)];
            return (
              <Marker
                // The marker is a static snapshot: re-key on anything it draws, so it never keeps an old score.
                key={`${pin.id}:${active}:${pin.score}:${pin.followed}`}
                coordinate={{ latitude: pin.latitude, longitude: pin.longitude }}
                anchor={{ x: 0.5, y: 1 }}
                tracksViewChanges={false}
                zIndex={active ? 10 : pin.followed ? 2 : 1}
                onPress={() => onSelect(pin.id)}
                accessibilityLabel={`${pin.name}, ${pinScoreLabel(pin.score, band?.label)}${pin.followed ? ', followed' : ''}`}
              >
                <View style={styles.pinWrap}>
                  <View style={[styles.pin, active && styles.pinActive]}>
                    <View style={[styles.stripe, { backgroundColor: band ? (active ? band.onDark : band.color) : colors.fogDeep }]} />
                    <View style={{ alignItems: 'center', paddingHorizontal: 6 }}>
                      <T variant="numeralS" color={active ? colors.onDark : colors.ink} maxFontSizeMultiplier={1.1}>{pin.score ?? '–'}</T>
                      <T variant="caption" weight="600" color={active ? colors.onDarkMuted : colors.inkSoft} style={{ fontSize: 10, lineHeight: 12 }} numberOfLines={1} maxFontSizeMultiplier={1.1}>{shortLakeName(pin.name)}</T>
                    </View>
                    {pin.followed ? <View style={styles.followDot} /> : null}
                  </View>
                  <View style={[styles.pointer, active && { borderTopColor: colors.deep }]} />
                </View>
              </Marker>
            );
          })}
        </MapView>
        <View style={styles.showAll}>
          <IconButton icon="expand" label="Show all lakes" tone="paper" size={touch.min} onPress={() => fit(true)} />
        </View>
      </View>
    );
  };
}

const styles = StyleSheet.create({
  pinWrap: { alignItems: 'center' },
  showAll: { position: 'absolute', top: spacing.md, right: spacing.md, borderRadius: touch.min / 2, ...elevation.low },
  pin: { flexDirection: 'row', alignItems: 'center', minHeight: 40, minWidth: 58, borderRadius: radius.sm, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.lineStrong, overflow: 'hidden' },
  pinActive: { backgroundColor: colors.deep, borderColor: colors.deep },
  stripe: { width: 5, alignSelf: 'stretch' },
  followDot: { position: 'absolute', top: 4, right: 4, width: 6, height: 6, borderRadius: 3, backgroundColor: colors.sunrise },
  pointer: { width: 0, height: 0, borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 7, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: colors.lineStrong },
});
