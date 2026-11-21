import { useEffect, useMemo, useState } from 'react';
import type { ForecastHour, ForecastWindow } from '@bitecast/engine';
import { StyleSheet, View, type AccessibilityActionEvent, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Defs, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import * as SunCalc from 'suncalc';
import { colors, scoreBand, scoreBands } from '@/constants/theme';
import { formatTime, shortClock } from '@/lib/format';
import { Icon } from './icon';
import { LakeSchool, type Mood } from './lake-school';
import { T } from './ui';

/*
 * Lake scene for Today. The forecast is shown as a ribbon of blocks along the waterline —
 * honest for broad time-block forecasts (no implied hourly precision). Above it, the sun or
 * moon rides with the scrubbed hour; below it, the lake and a school of walleye.
 */

const H = 200;
const HORIZON = 82;
const RIB_H = 20;
const FADE = 40;
const PAD = 12;
const TICK_LABEL_W = 92;
const TAG_HALF = 44;
const MARKER_W = 56;
const TAG_H = 17;
const GLYPH = 26;
/** Glyph centre sits just above the ribbon. */
const GLYPH_Y = HORIZON - GLYPH / 2 - 4;
const MARKER_TOP = GLYPH_Y - GLYPH / 2 - 4 - TAG_H;

export const moodFor = (score: number): Mood => (score >= 60 ? 'active' : score >= 40 ? 'idle' : 'sleepy');

type Props = {
  hours: ForecastHour[];
  windows: ForecastWindow[];
  ice: boolean;
  index: number;
  onIndexChange: (index: number) => void;
  /** Lake location, for the true sun position (day/night marker, sunrise/sunset ticks). */
  latitude?: number;
  longitude?: number;
  fishCount?: number;
  fishScale?: number;
};

type Segment = { start: number; end: number; score: number; window: boolean };

/** Nudge only once per app session. */
let nudged = false;

export function SkyArc({ hours, windows, ice, index, onIndexChange, latitude, longitude, fishCount, fishScale }: Props) {
  const data = hours.slice(0, 24);
  const [width, setWidth] = useState(0);
  const reduced = useReducedMotion();
  const step = width ? (width - PAD * 2) / Math.max(1, data.length) : 0;
  const xAt = (i: number) => PAD + i * step;
  const windowSet = useMemo(() => new Set(windows.flatMap((w) => w.hours.map((h) => h.ts))), [windows]);

  const elev = useMemo(
    () => data.map((hour) => (latitude !== undefined && longitude !== undefined ? (SunCalc.getPosition(new Date(hour.ts), latitude, longitude).altitude * 180) / Math.PI : hour.sunElevation)),
    [data, latitude, longitude],
  );

  // Consecutive hours with the same band and window state form one block.
  const segments = useMemo(() => {
    const out: Segment[] = [];
    data.forEach((hour, i) => {
      const inWindow = windowSet.has(hour.ts);
      const last = out[out.length - 1];
      if (last && scoreBand(last.score) === scoreBand(hour.score) && last.window === inWindow) {
        last.end = i;
        last.score = Math.max(last.score, hour.score);
      } else out.push({ start: i, end: i, score: hour.score, window: inWindow });
    });
    return out;
  }, [data, windowSet]);

  const crossings = elev.flatMap((e, i): { i: number; label: 'rise' | 'set' }[] => {
    const prev = elev[i - 1];
    if (prev === undefined) return [];
    if (prev < 0 && e >= 0) return [{ i: i - 1 + prev / (prev - e), label: 'rise' }];
    if (prev >= 0 && e < 0) return [{ i: i - 1 + prev / (prev - e), label: 'set' }];
    return [];
  });
  const clockAt = (fraction: number) => shortClock(new Date(new Date(data[0].ts).getTime() + fraction * 3_600_000));

  // Marker eases to the centre of the scrubbed hour.
  const mx = useSharedValue(0);
  const target = step ? xAt(index) + step / 2 : 0;
  useEffect(() => {
    if (!step) return;
    if (!nudged && !reduced && index === 0) {
      nudged = true;
      mx.set(target);
      mx.set(withDelay(700, withSequence(withTiming(target + step * 2, { duration: 380, easing: Easing.out(Easing.quad) }), withTiming(target, { duration: 420, easing: Easing.inOut(Easing.quad) }))));
      return;
    }
    mx.set(withTiming(target, { duration: reduced ? 0 : 140, easing: Easing.out(Easing.quad) }));
  }, [target, step, index, reduced, mx]);
  const markerStyle = useAnimatedStyle(() => ({ transform: [{ translateX: mx.get() - MARKER_W / 2 }] }));
  const guideStyle = useAnimatedStyle(() => ({ transform: [{ translateX: mx.get() }] }));
  const tagStyle = useAnimatedStyle(() => {
    const x = mx.get();
    return { transform: [{ translateX: Math.max(0, TAG_HALF + 4 - x) - Math.max(0, x + TAG_HALF + 4 - width) }] };
  });

  const pick = (x: number) => {
    if (!step) return;
    const next = Math.min(data.length - 1, Math.max(0, Math.floor((x - PAD) / step)));
    if (next !== index) onIndexChange(next);
  };
  const onTouch = (event: GestureResponderEvent) => pick(event.nativeEvent.locationX);

  const hour = data[index] ?? data[0];
  if (!hour) return null;
  const daylight = (elev[index] ?? 0) > 0;
  const band = scoreBands[scoreBand(hour.score)];
  const lakeH = H - HORIZON;

  return (
    <View
      style={{ height: H }}
      onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Bite outlook for the next 24 hours"
      accessibilityValue={{ text: `${index === 0 ? 'Now' : formatTime(hour.ts)}, bite score ${hour.score}, ${band.label}${windowSet.has(hour.ts) ? ', inside a window' : ''}` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event: AccessibilityActionEvent) => onIndexChange(Math.min(data.length - 1, Math.max(0, index + (event.nativeEvent.actionName === 'increment' ? 1 : -1))))}
    >
      {width ? (
        <Svg width={width} height={H} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <LinearGradient id="lake" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={ice ? '#E6EEF0' : colors.chartWater} />
              <Stop offset={(lakeH - FADE) / lakeH} stopColor={ice ? '#D3DFE2' : colors.chartWaterDeep} />
              <Stop offset="1" stopColor={colors.cream} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={HORIZON} width={width} height={lakeH} fill="url(#lake)" />
          {[0.45, 0.75].map((t) => {
            const y = HORIZON + RIB_H + (lakeH - RIB_H - FADE) * t;
            return <Path key={t} d={`M0 ${y} C${width * 0.25} ${y - 3} ${width * 0.5} ${y + 3} ${width * 0.75} ${y - 2} S${width} ${y + 2} ${width} ${y}`} stroke={colors.chartContour} strokeWidth={1} fill="none" opacity={0.6} />;
          })}
          {ice ? <Rect x={0} y={HORIZON + RIB_H} width={width} height={6} fill={colors.white} opacity={0.85} /> : null}
          {/* Sunrise / sunset ticks from the label down to the waterline */}
          {crossings.map((c) => {
            const x = PAD + (c.i + 0.5) * step;
            return <Line key={c.label} x1={x} y1={22} x2={x} y2={HORIZON} stroke={colors.inkFaint} strokeWidth={1} strokeDasharray="2 4" opacity={0.6} />;
          })}
        </Svg>
      ) : null}

      {/* Fish live below the ribbon and react to the scrubbed hour */}
      {width ? <LakeSchool width={width} top={HORIZON + RIB_H + (ice ? 10 : 6)} bottom={H - FADE - 14} mood={moodFor(hour.score)} count={fishCount} sizeScale={fishScale} /> : null}

      {/* Block ribbon along the waterline */}
      {width
        ? segments.map((seg) => {
            const b = scoreBands[scoreBand(seg.score)];
            const left = xAt(seg.start) + 1;
            const w = Math.max(2, xAt(seg.end + 1) - xAt(seg.start) - 2);
            const current = index >= seg.start && index <= seg.end;
            return (
              <View
                key={`${seg.start}-${seg.end}`}
                pointerEvents="none"
                style={[
                  styles.segment,
                  { left, width: w, backgroundColor: seg.window ? b.color : b.tint, borderColor: current ? colors.ink : 'transparent' },
                  seg.window && styles.segmentWindow,
                ]}
              >
                {w >= 46 ? (
                  <T variant="label" color={seg.window ? colors.white : b.color} style={styles.segmentLabel} numberOfLines={1} maxFontSizeMultiplier={1}>
                    {b.label}
                  </T>
                ) : null}
              </View>
            );
          })
        : null}

      {/* Sunrise / sunset labels (step aside for the marker tag) */}
      {width
        ? crossings.map((c) => {
            const centre = PAD + (c.i + 0.5) * step;
            const left = Math.min(width - TICK_LABEL_W - 2, Math.max(2, centre - TICK_LABEL_W / 2));
            const near = Math.abs(target - (left + TICK_LABEL_W / 2)) < TICK_LABEL_W * 0.75;
            return (
              <View key={c.label} pointerEvents="none" style={[styles.tickLabel, { left, opacity: near ? 0 : 1 }]}>
                <Icon name={c.label === 'rise' ? 'today' : 'low-light'} size={11} color={colors.inkMuted} />
                <T variant="caption" color={colors.inkMuted} style={{ fontSize: 10.5 }} numberOfLines={1} maxFontSizeMultiplier={1.1}>{clockAt(c.i + 0.5)}</T>
              </View>
            );
          })
        : null}

      {/* Guide + sun/moon marker with time · score tag */}
      {width ? (
        <>
          <Animated.View pointerEvents="none" style={[styles.guide, guideStyle]} />
          <Animated.View pointerEvents="none" style={[styles.marker, markerStyle]}>
            <Animated.View style={[styles.tag, tagStyle]}>
              <T variant="caption" weight="700" color={colors.onDark} style={{ fontSize: 10.5, lineHeight: 13 }} numberOfLines={1} maxFontSizeMultiplier={1.1}>
                {index === 0 ? 'Now' : shortClock(hour.ts)} · {hour.score}
              </T>
            </Animated.View>
            {daylight ? <SunGlyph /> : <MoonGlyph />}
          </Animated.View>
        </>
      ) : null}

      <View style={styles.axis} pointerEvents="none">
        {[0, 6, 12, 18, 23].map((i) => (data[i] ? <T key={i} variant="caption" color={colors.inkMuted} style={{ fontSize: 10.5 }} maxFontSizeMultiplier={1.2}>{i === 0 ? 'Now' : shortClock(data[i].ts)}</T> : null))}
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

function SunGlyph() {
  return (
    <View style={styles.glyph}>
      {Array.from({ length: 8 }, (_, i) => (
        <View key={i} style={[styles.ray, { transform: [{ rotate: `${i * 45}deg` }, { translateY: -10.5 }] }]} />
      ))}
      <View style={styles.sunCore} />
    </View>
  );
}

function MoonGlyph() {
  return (
    <View style={styles.glyph}>
      <View style={styles.moonCore}>
        <Icon name="moon" size={12} color={colors.inkSoft} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  segment: { position: 'absolute', top: HORIZON, height: RIB_H, borderRadius: 5, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  segmentWindow: { shadowColor: colors.sunrise, shadowOpacity: 0.55, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
  segmentLabel: { fontSize: 9, lineHeight: 11, letterSpacing: 0.8 },
  tickLabel: { position: 'absolute', top: 4, width: TICK_LABEL_W, flexDirection: 'row', gap: 4, alignItems: 'center', justifyContent: 'center' },
  guide: { position: 'absolute', top: GLYPH_Y, height: HORIZON + RIB_H - GLYPH_Y, width: 1, backgroundColor: colors.ink, opacity: 0.35 },
  marker: { position: 'absolute', top: MARKER_TOP, left: 0, width: MARKER_W, alignItems: 'center', gap: 4 },
  tag: { height: TAG_H, paddingHorizontal: 7, borderRadius: TAG_H / 2, backgroundColor: colors.deep, justifyContent: 'center' },
  glyph: { width: GLYPH, height: GLYPH, alignItems: 'center', justifyContent: 'center' },
  ray: { position: 'absolute', width: 2.5, height: 5, borderRadius: 1.5, backgroundColor: colors.sunrise },
  sunCore: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.sunrise, borderWidth: 2, borderColor: colors.white },
  moonCore: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.paper, borderWidth: 1.5, borderColor: colors.inkSoft, alignItems: 'center', justifyContent: 'center' },
  axis: { position: 'absolute', left: PAD - 4, right: PAD - 8, bottom: FADE - 8, flexDirection: 'row', justifyContent: 'space-between' },
});
