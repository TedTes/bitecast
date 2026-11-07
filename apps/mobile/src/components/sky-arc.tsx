import { useEffect, useMemo, useState } from 'react';
import type { ForecastHour, ForecastWindow } from '@bitecast/engine';
import { StyleSheet, View, type AccessibilityActionEvent, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Defs, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { colors, scoreBand, scoreBands } from '@/constants/theme';
import { formatTime, shortClock } from '@/lib/format';
import { T } from './ui';
import { LakeSchool, type Mood } from './lake-school';

/* Geometry (points). The SVG is purely visual; a transparent overlay handles touch. */
const H = 244;
const HORIZON = 112;
const SKY_TOP = 14;
const NIGHT_DIP = 20;
const AXIS_Y = H - 16;
const PAD = 14;
const MAX_ELEVATION = 45;
const MIN_ELEVATION = -12;

const yFor = (elevation: number) =>
  elevation >= 0
    ? HORIZON - (Math.min(elevation, MAX_ELEVATION) / MAX_ELEVATION) * (HORIZON - SKY_TOP)
    : HORIZON + (Math.min(-elevation, -MIN_ELEVATION) / -MIN_ELEVATION) * NIGHT_DIP;

/** Smooth path through points (Catmull-Rom → cubic Bézier). */
function smooth(points: { x: number; y: number }[]) {
  if (points.length < 2) return '';
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i], p1 = points[i], p2 = points[i + 1], p3 = points[i + 2] ?? p2;
    d += ` C${p1.x + (p2.x - p0.x) / 6},${p1.y + (p2.y - p0.y) / 6} ${p2.x - (p3.x - p1.x) / 6},${p2.y - (p3.y - p1.y) / 6} ${p2.x},${p2.y}`;
  }
  return d;
}

export const moodFor = (score: number): Mood => (score >= 60 ? 'active' : score >= 40 ? 'idle' : 'sleepy');

type Props = {
  hours: ForecastHour[];
  windows: ForecastWindow[];
  ice: boolean;
  index: number;
  onIndexChange: (index: number) => void;
};

/**
 * Sky arc: the next 24 hours of sun elevation over a lake horizon. Daylight rises above the
 * waterline, night dips under it; window hours glow. Drag to scrub hours.
 */
export function SkyArc({ hours, windows, ice, index, onIndexChange }: Props) {
  const data = hours.slice(0, 24);
  const [width, setWidth] = useState(0);
  const reduced = useReducedMotion();
  const step = width ? (width - PAD * 2) / Math.max(1, data.length - 1) : 0;
  const points = useMemo(() => data.map((hour, i) => ({ x: PAD + i * step, y: yFor(hour.sunElevation) })), [data, step]);
  const windowSet = useMemo(() => new Set(windows.flatMap((w) => w.hours.map((h) => h.ts))), [windows]);

  // Window segments drawn over the curve.
  const segments = useMemo(() => {
    const out: { x: number; y: number }[][] = [];
    let run: { x: number; y: number }[] = [];
    data.forEach((hour, i) => {
      if (windowSet.has(hour.ts)) run.push(points[i]);
      else if (run.length) { out.push(run); run = []; }
    });
    if (run.length) out.push(run);
    return out.map((seg) => (seg.length === 1 ? [{ x: seg[0].x - step / 2, y: seg[0].y }, { x: seg[0].x + step / 2, y: seg[0].y }] : seg));
  }, [data, points, windowSet, step]);

  // Marker follows the scrubbed hour with a short ease.
  const mx = useSharedValue(0);
  const my = useSharedValue(HORIZON);
  const point = points[index] ?? points[0];
  useEffect(() => {
    if (!point) return;
    const ease = { duration: reduced ? 0 : 140, easing: Easing.out(Easing.quad) };
    mx.set(withTiming(point.x, ease));
    my.set(withTiming(point.y, ease));
  }, [point, mx, my, reduced]);
  const markerStyle = useAnimatedStyle(() => ({ transform: [{ translateX: mx.get() - 11 }, { translateY: my.get() - 11 }] }));
  const guideStyle = useAnimatedStyle(() => ({ transform: [{ translateX: mx.get() }] }));

  const pick = (x: number) => {
    if (!step) return;
    const next = Math.min(data.length - 1, Math.max(0, Math.round((x - PAD) / step)));
    if (next !== index) onIndexChange(next);
  };
  const onTouch = (event: GestureResponderEvent) => pick(event.nativeEvent.locationX);

  const hour = data[index] ?? data[0];
  const daylight = (hour?.sunElevation ?? 0) > 0;
  const band = hour ? scoreBands[scoreBand(hour.score)] : scoreBands.fair;
  const crossings = data.flatMap((h, i): { i: number; label: "rise" | "set" }[] => {
    const prev = data[i - 1];
    if (!prev) return [];
    if (prev.sunElevation < 0 && h.sunElevation >= 0) return [{ i: i - 1 + prev.sunElevation / (prev.sunElevation - h.sunElevation), label: 'rise' as const }];
    if (prev.sunElevation >= 0 && h.sunElevation < 0) return [{ i: i - 1 + prev.sunElevation / (prev.sunElevation - h.sunElevation), label: 'set' as const }];
    return [];
  });
  const clockAt = (fraction: number) => shortClock(new Date(new Date(data[0].ts).getTime() + fraction * 3_600_000));

  if (!data.length) return null;

  return (
    <View
      style={{ height: H }}
      onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Sun and bite score over the next 24 hours"
      accessibilityValue={{ text: hour ? `${index === 0 ? 'Now' : formatTime(hour.ts)}, bite score ${hour.score}, ${band.label}${windowSet.has(hour.ts) ? ', inside a window' : ''}` : undefined }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event: AccessibilityActionEvent) => onIndexChange(Math.min(data.length - 1, Math.max(0, index + (event.nativeEvent.actionName === 'increment' ? 1 : -1))))}
    >
      {width ? (
        <Svg width={width} height={H} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={daylight ? '#E3EFEC' : '#D9E1E3'} />
              <Stop offset="1" stopColor={daylight ? '#F8F3E6' : '#EEF0EC'} />
            </LinearGradient>
            <LinearGradient id="lake" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={ice ? '#E6EEF0' : colors.chartWater} />
              <Stop offset="1" stopColor={ice ? '#D3DFE2' : colors.chartWaterDeep} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={width} height={HORIZON} fill="url(#sky)" />
          <Rect x={0} y={HORIZON} width={width} height={AXIS_Y - HORIZON - 6} fill="url(#lake)" />
          {/* Gentle ripples / contour lines in the lake */}
          {[0.35, 0.65].map((t) => {
            const y = HORIZON + (AXIS_Y - HORIZON - 6) * t;
            return <Path key={t} d={`M0 ${y} C${width * 0.25} ${y - 3} ${width * 0.5} ${y + 3} ${width * 0.75} ${y - 2} S${width} ${y + 2} ${width} ${y}`} stroke={colors.chartContour} strokeWidth={1} fill="none" opacity={0.6} />;
          })}
          {ice ? (
            <>
              <Rect x={0} y={HORIZON} width={width} height={7} fill={colors.white} opacity={0.9} />
              <Path d={`M${width * 0.22} ${HORIZON + 1} l8 5 l6 -3 M${width * 0.71} ${HORIZON + 2} l-7 4 l5 1`} stroke={colors.chartContour} strokeWidth={1} fill="none" />
            </>
          ) : null}
          <Line x1={0} y1={HORIZON} x2={width} y2={HORIZON} stroke={colors.teal} strokeWidth={1} opacity={0.5} />
          {/* Sun-elevation curve, then window segments on top */}
          <Path d={smooth(points)} stroke={colors.inkFaint} strokeWidth={2} fill="none" strokeLinecap="round" opacity={0.85} />
          {segments.map((seg, i) => (
            <Path key={i} d={smooth(seg)} stroke={colors.sunrise} strokeWidth={6} fill="none" strokeLinecap="round" opacity={0.9} />
          ))}
        </Svg>
      ) : null}

      {/* A subtle school of walleye fills the lake and reacts to the scrubbed hour */}
      {width ? <LakeSchool width={width} top={HORIZON + (ice ? 10 : 4)} bottom={AXIS_Y - 8} mood={moodFor(hour?.score ?? 0)} /> : null}

      {/* Vertical guide + sun/moon marker */}
      {width ? (
        <>
          <Animated.View pointerEvents="none" style={[styles.guide, guideStyle]} />
          <Animated.View pointerEvents="none" style={[styles.marker, daylight ? styles.sun : styles.moon, markerStyle]} />
        </>
      ) : null}

      {/* Horizon labels and hour axis */}
      {width
        ? crossings.map((c) => (
            <T key={c.label} variant="caption" color={colors.inkMuted} style={[styles.horizonLabel, { left: Math.min(width - 70, Math.max(4, PAD + c.i * step - 34)) }]} maxFontSizeMultiplier={1.2}>
              {c.label === 'rise' ? 'Sunrise' : 'Sunset'} {clockAt(c.i)}
            </T>
          ))
        : null}
      <View style={styles.axis} pointerEvents="none">
        {[0, 6, 12, 18, 23].map((i) => (
          <T key={i} variant="caption" color={colors.inkMuted} style={{ fontSize: 10.5 }} maxFontSizeMultiplier={1.2}>{i === 0 ? 'Now' : shortClock(data[i].ts)}</T>
        ))}
      </View>

      {/* Touch surface */}
      <View
        style={StyleSheet.absoluteFill}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={onTouch}
        onResponderMove={onTouch}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  guide: { position: 'absolute', top: SKY_TOP - 6, height: HORIZON + NIGHT_DIP - SKY_TOP + 10, width: 1, backgroundColor: colors.lineStrong },
  marker: { position: 'absolute', top: 0, left: 0, width: 22, height: 22, borderRadius: 11, borderWidth: 3 },
  sun: { backgroundColor: colors.sunrise, borderColor: colors.white },
  moon: { backgroundColor: colors.paper, borderColor: colors.inkSoft },
  horizonLabel: { position: 'absolute', top: HORIZON - 18, fontSize: 10.5 },
  axis: { position: 'absolute', left: PAD - 4, right: PAD - 8, bottom: 0, flexDirection: 'row', justifyContent: 'space-between' },
});
