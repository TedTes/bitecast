import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { colors, radius, scoreBand, scoreBands, spacing } from '@/constants/theme';
import { shortLakeName } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { Icon } from '../icon';
import { T } from '../ui';
import type { LakeMapProps, MapLakePin } from './types';

const PIN_W = 66;
const PIN_H = 44;
const PAD = 52;
/** Space hidden under the overlapping bottom sheet. */
const BOTTOM_RESERVE = 24;

type Placed = MapLakePin & { x: number; y: number; px: number; py: number };

/** Equirectangular projection fitted to the pins, then simple collision relaxation. */
function layout(pins: MapLakePin[], width: number, height: number): Placed[] {
  if (!pins.length || !width || !height) return [];
  const lats = pins.map((p) => p.latitude);
  const lons = pins.map((p) => p.longitude);
  const midLat = ((Math.min(...lats) + Math.max(...lats)) / 2) * (Math.PI / 180);
  const minLon = Math.min(...lons), maxLon = Math.max(...lons), minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const spanX = Math.max(0.5, (maxLon - minLon) * Math.cos(midLat));
  const spanY = Math.max(0.5, maxLat - minLat);
  // Schematic chart: axes are scaled independently to use the whole canvas (labelled “not to scale”).
  const scaleX = (width - PAD * 2) / spanX;
  const scaleY = (height - PAD * 2 - PIN_H - BOTTOM_RESERVE) / spanY;
  const offX = PAD;
  const offY = PAD + PIN_H;
  const placed = pins.map((pin) => {
    const x = offX + (pin.longitude - minLon) * Math.cos(midLat) * scaleX;
    const y = offY + (maxLat - pin.latitude) * scaleY;
    return { ...pin, x, y, px: x, py: y - PIN_H * 0.75 };
  });
  // Push overlapping labels apart; true positions stay put and get a leader line.
  for (let iteration = 0; iteration < 80; iteration += 1) {
    let moved = false;
    for (let i = 0; i < placed.length; i += 1) {
      for (let j = i + 1; j < placed.length; j += 1) {
        const a = placed[i], b = placed[j];
        const dx = b.px - a.px, dy = b.py - a.py;
        const overlapX = PIN_W + 6 - Math.abs(dx), overlapY = PIN_H + 6 - Math.abs(dy);
        if (overlapX > 0 && overlapY > 0) {
          moved = true;
          if (overlapX < overlapY) {
            const push = (overlapX / 2) * (dx >= 0 ? 1 : -1);
            a.px -= push; b.px += push;
          } else {
            const push = (overlapY / 2) * (dy >= 0 ? 1 : -1);
            a.py -= push; b.py += push;
          }
        }
      }
    }
    placed.forEach((p) => {
      p.px = Math.min(width - PIN_W / 2 - 4, Math.max(PIN_W / 2 + 4, p.px));
      p.py = Math.min(height - PIN_H / 2 - BOTTOM_RESERVE, Math.max(PIN_H / 2 + 4, p.py));
    });
    if (!moved) break;
  }
  return placed;
}

/**
 * Code-native lake chart. Works with zero network: graticule, contour rings and score
 * pins on a plain chart background. This is the offline fallback for every provider.
 */
export function CachedChartMap({ pins, selectedId, onSelect }: LakeMapProps) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const placed = useMemo(() => layout(pins, size.width, size.height), [pins, size]);
  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width !== size.width || height !== size.height) setSize({ width, height });
  };
  // Selected pin renders last so it sits on top.
  const ordered = [...placed].sort((a, b) => Number(a.id === selectedId) - Number(b.id === selectedId));

  return (
    <View style={styles.map} onLayout={onLayout}>
      {/* Graticule */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill} importantForAccessibility="no-hide-descendants">
        {[0.2, 0.4, 0.6, 0.8].map((p) => <View key={`v${p}`} style={[styles.gridV, { left: `${p * 100}%` }]} />)}
        {[0.25, 0.5, 0.75].map((p) => <View key={`h${p}`} style={[styles.gridH, { top: `${p * 100}%` }]} />)}
      </View>
      {/* Water bodies with bathymetric contour rings */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill} importantForAccessibility="no-hide-descendants">
        {placed.map((pin) => {
          const r = pin.scale === 'large' ? 52 : 28;
          return (
            <View key={`w${pin.id}`} style={{ position: 'absolute', left: pin.x - r, top: pin.y - r * 0.7, width: r * 2, height: r * 1.4 }}>
              <View style={[styles.water, { borderRadius: r }]} />
              <View style={[styles.contour, { margin: r * 0.22, borderRadius: r }]} />
              <View style={[styles.contour, { margin: r * 0.44, borderRadius: r, backgroundColor: colors.chartWaterDeep }]} />
            </View>
          );
        })}
      </View>
      {/* Leader lines */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill} importantForAccessibility="no-hide-descendants">
        {placed.map((pin) => {
          const dx = pin.px - pin.x, dy = pin.py + PIN_H / 2 - pin.y;
          const length = Math.sqrt(dx * dx + dy * dy);
          const angle = Math.atan2(dy, dx);
          return (
            <View key={`l${pin.id}`}>
              <View style={[styles.leader, { left: pin.x + dx / 2 - length / 2, top: pin.y + dy / 2, width: length, transform: [{ rotate: `${angle}rad` }] }]} />
              <View style={[styles.dot, { left: pin.x - 4, top: pin.y - 4 }]} />
            </View>
          );
        })}
      </View>
      {/* Pins */}
      {ordered.map((pin) => {
        const band = scoreBands[scoreBand(pin.score)];
        const active = pin.id === selectedId;
        return (
          <Pressable
            key={pin.id}
            onPress={() => {
              if (!active) haptic.select();
              onSelect(pin.id);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${pin.name}, best bite score ${pin.score}, ${band.label}${pin.followed ? ', followed' : ''}`}
            accessibilityHint="Shows the window, reasons and confidence below the map"
            style={[styles.pin, { left: pin.px - PIN_W / 2, top: pin.py - PIN_H / 2 }, active && styles.pinActive]}
          >
            <View style={[styles.pinStripe, { backgroundColor: active ? band.onDark : band.color }]} />
            <View style={{ alignItems: 'center', flex: 1 }}>
              <T variant="numeralS" color={active ? colors.onDark : colors.ink} maxFontSizeMultiplier={1.1}>{pin.score}</T>
              <T variant="caption" weight="700" color={active ? colors.onDarkMuted : colors.inkSoft} style={{ fontSize: 10, lineHeight: 12 }} numberOfLines={1} maxFontSizeMultiplier={1.1}>{shortLakeName(pin.name)}</T>
            </View>
            {pin.followed ? <View style={styles.followDot} /> : null}
          </Pressable>
        );
      })}
      <View style={styles.compass} importantForAccessibility="no-hide-descendants">
        <Icon name="north" size={14} color={colors.ink} />
        <T variant="caption" weight="800" style={{ fontSize: 10, lineHeight: 12 }}>N</T>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1, backgroundColor: colors.chartLand, overflow: 'hidden' },
  gridV: { position: 'absolute', top: 0, bottom: 0, width: StyleSheet.hairlineWidth, backgroundColor: colors.chartGrid },
  gridH: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.chartGrid },
  water: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.chartWater },
  contour: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: 1, borderColor: colors.chartContour },
  leader: { position: 'absolute', height: 1, backgroundColor: colors.inkFaint },
  dot: { position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: colors.ink, borderWidth: 1.5, borderColor: colors.paper },
  pin: { position: 'absolute', width: PIN_W, height: PIN_H, flexDirection: 'row', alignItems: 'center', borderRadius: radius.sm, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.lineStrong, overflow: 'hidden', paddingRight: 4 },
  pinActive: { backgroundColor: colors.deep, borderColor: colors.deep, transform: [{ scale: 1.08 }] },
  pinStripe: { width: 5, alignSelf: 'stretch', marginRight: 2 },
  followDot: { position: 'absolute', top: 4, right: 4, width: 6, height: 6, borderRadius: 3, backgroundColor: colors.sunrise },
  compass: { position: 'absolute', right: spacing.md, top: spacing.md, width: 40, height: 40, borderRadius: 20, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line },
});
