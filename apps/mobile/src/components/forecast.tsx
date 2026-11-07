import { useMemo, useState } from 'react';
import type { Confidence as ConfidenceLevel, ForecastHour, ForecastWindow } from '@bitecast/engine';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, Keyframe } from 'react-native-reanimated';
import { colors, radius, scoreBand, scoreBands, spacing } from '@/constants/theme';
import { capitalize, formatDay, formatHour, formatTime, reasonIcon, reasonIsNegative, shortClock, shortRange } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { Icon } from './icon';
import { Card, Chip, Divider, Row, T } from './ui';

type Tone = 'light' | 'dark';

/* ───────────── Formatting helpers (shared by screens) ───────────── */

/** Engine `end` is the start of the last hour; the window runs until the end of that hour. */
export const windowEnd = (window: ForecastWindow) => new Date(new Date(window.end).getTime() + 3_600_000).toISOString();
/** Compact field format: “7–10 am”, “11 am–2 pm”. */
export const formatWindow = (window: ForecastWindow) => shortRange(window.start, windowEnd(window));
export const windowPeak = (window: ForecastWindow) => [...window.hours].sort((a, b) => b.score - a.score)[0];
export const conditionLabel = (score: number) => `${scoreBands[scoreBand(score)].label} conditions`;
export const scoreColor = (score: number) => scoreBands[scoreBand(score)].color;
export { formatTime };

/** Windows that have not finished yet, soonest first. */
export const upcomingWindows = (windows: ForecastWindow[], now = Date.now()) =>
  windows.filter((w) => new Date(windowEnd(w)).getTime() > now).sort((a, b) => a.start.localeCompare(b.start));

/** Best (highest peak) window starting within the next `hours`. */
export const bestWindowWithin = (windows: ForecastWindow[], hours = 24, now = Date.now()) =>
  upcomingWindows(windows, now)
    .filter((w) => new Date(w.start).getTime() - now < hours * 3_600_000)
    .sort((a, b) => b.peakScore - a.peakScore)[0];

/* ───────────── Score ───────────── */

const scoreSizes = {
  sm: { minWidth: 58, numeral: 'numeralM', pad: spacing.sm, meter: false },
  md: { minWidth: 78, numeral: 'numeralL', pad: spacing.md, meter: true },
  lg: { minWidth: 112, numeral: 'numeralXL', pad: spacing.md, meter: true },
} as const;

/**
 * Bite score “instrument readout”: numeral, band word and a ten-tick meter.
 * The band word means meaning never depends on colour alone.
 */
export function ScoreReadout({ score, size = 'md', tone = 'light', caption = 'Bite score' }: { score: number; size?: keyof typeof scoreSizes; tone?: Tone; caption?: string }) {
  const band = scoreBands[scoreBand(score)];
  const s = scoreSizes[size];
  const dark = tone === 'dark';
  const accent = dark ? band.onDark : band.color;
  const ticks = Math.round(score / 10);
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${caption} ${score} out of 100, ${band.label}`}
      style={[styles.readout, { minWidth: s.minWidth, padding: s.pad }, dark ? styles.readoutDark : styles.readoutLight]}
    >
      {size !== 'sm' ? <T variant="label" color={dark ? colors.onDarkMuted : colors.inkMuted} style={{ fontSize: 9, letterSpacing: 1 }}>{caption}</T> : null}
      <T variant={s.numeral} color={dark ? colors.onDark : colors.ink}>{score}</T>
      {s.meter ? (
        <View style={styles.meter}>
          {Array.from({ length: 10 }, (_, index) => (
            <Animated.View key={index} entering={index < ticks ? FadeIn.duration(180).delay(120 + index * 45) : undefined} style={[styles.tick, { backgroundColor: index < ticks ? accent : dark ? colors.deepLine : colors.fogDeep }]} />
          ))}
        </View>
      ) : null}
      <T variant="caption" weight="700" color={accent} style={size === 'sm' ? { fontSize: 11 } : undefined}>{band.label}</T>
    </View>
  );
}

/* ───────────── Confidence ───────────── */

const confidenceLevel: Record<ConfidenceLevel, number> = { High: 3, Medium: 2, Low: 1 };
const confidenceHelp: Record<ConfidenceLevel, string> = {
  High: 'Fresh weather data and a known lake profile.',
  Medium: 'Some inputs are estimated, such as lake clarity.',
  Low: 'Older weather data or far-ahead hours. Treat as a rough guide.',
};

export function ConfidenceMeter({ value, tone = 'light', explain }: { value: ConfidenceLevel; tone?: Tone; explain?: boolean }) {
  const level = confidenceLevel[value];
  const dark = tone === 'dark';
  const on = dark ? colors.mint : colors.teal;
  const off = dark ? colors.deepLine : colors.fogDeep;
  return (
    <View accessible accessibilityLabel={`${value} confidence.${explain ? ` ${confidenceHelp[value]}` : ''}`} style={{ gap: 4 }}>
      <Row gap={spacing.sm}>
        <View style={styles.bars}>
          {[1, 2, 3].map((bar) => (
            <View key={bar} style={[styles.bar, { height: 4 + bar * 3, backgroundColor: bar <= level ? on : off }]} />
          ))}
        </View>
        <T variant="caption" weight="700" color={dark ? colors.onDarkMuted : colors.inkSoft}>{value} confidence</T>
      </Row>
      {explain ? <T variant="caption" color={dark ? colors.onDarkMuted : colors.inkMuted}>{confidenceHelp[value]}</T> : null}
    </View>
  );
}

/* ───────────── Reasons ───────────── */

export function ReasonChips({ reasons, limit = 3, tone = 'light' }: { reasons: string[]; limit?: number; tone?: Tone }) {
  if (!reasons.length) return <T variant="caption" color={tone === 'dark' ? colors.onDarkMuted : colors.inkMuted}>No standout conditions this hour.</T>;
  return (
    <View style={styles.chips} accessibilityLabel={`Reasons: ${reasons.slice(0, limit).join(', ')}`}>
      {reasons.slice(0, limit).map((reason) =>
        tone === 'dark' ? (
          <View key={reason} style={styles.darkChip} accessible accessibilityLabel={reason}>
            <Icon name={reasonIcon(reason)} size={13} color={reasonIsNegative(reason) ? scoreBands.fair.onDark : colors.mint} />
            <T variant="caption" weight="700" color={colors.onDark}>{reason}</T>
          </View>
        ) : (
          <Chip key={reason} label={reason} icon={reasonIcon(reason)} tone={reasonIsNegative(reason) ? 'warm' : 'teal'} />
        ),
      )}
    </View>
  );
}

/** Numbered reason list for detail screens. */
export function ReasonList({ reasons }: { reasons: string[] }) {
  return (
    <View style={{ gap: spacing.md }}>
      {reasons.map((reason) => {
        const negative = reasonIsNegative(reason);
        return (
          <Row key={reason} gap={spacing.md} align="center">
            <View style={[styles.reasonIcon, negative && { backgroundColor: colors.sunriseTint }]}>
              <Icon name={reasonIcon(reason)} size={18} color={negative ? colors.sunriseInk : colors.teal} />
            </View>
            <View style={{ flex: 1 }}>
              <T variant="subhead" weight="600">{reason}</T>
              {negative ? <T variant="caption" color={colors.sunriseInk}>Works against the bite</T> : null}
            </View>
          </Row>
        );
      })}
    </View>
  );
}

/* ───────────── Window card ───────────── */

export function WindowCard({ window, onPress, label }: { window: ForecastWindow; onPress?: () => void; label?: string }) {
  const peak = windowPeak(window);
  const heading = label ?? formatDay(window.start);
  return (
    <Card
      onPress={onPress}
      accessibilityLabel={`${heading}, ${formatWindow(window)}. Peak bite score ${window.peakScore}, ${scoreBands[scoreBand(window.peakScore)].label}. ${window.reasons.slice(0, 3).join(', ')}. ${window.confidence} confidence.`}
      accessibilityHint={onPress ? 'Opens light curve, contributors and tactics' : undefined}
    >
      <Row gap={spacing.lg} align="center">
        <ScoreReadout score={window.peakScore} caption="Peak" />
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="label" color={colors.sunriseInk}>{heading}</T>
          <T variant="headline">{formatWindow(window)}</T>
          <T variant="caption" color={colors.inkMuted}>Peaks near {formatHour(peak.ts)} · {window.hours.length} h above 60</T>
        </View>
      </Row>
      <ReasonChips reasons={window.reasons} />
      <ConfidenceMeter value={window.confidence} />
      <Divider />
      <Row gap={spacing.md} align="flex-start">
        <Icon name="tactics" size={18} color={colors.teal} style={{ marginTop: 2 }} />
        <T variant="callout" style={{ flex: 1 }}>
          <T variant="callout" weight="700">{capitalize(window.depth)} water · </T>
          {window.tactics}
        </T>
      </Row>
      {onPress ? (
        <Row gap={4} justify="flex-end">
          <T variant="caption" weight="700" color={colors.teal}>Light curve & tactics</T>
          <Icon name="chevron-right" size={13} color={colors.teal} />
        </Row>
      ) : null}
    </Card>
  );
}

/* ───────────── Hourly chart (interactive) ───────────── */

const CHART_HEIGHT = 96;
/** Bars rise from the baseline on first render (skipped automatically under reduce motion). */
const growIn = new Keyframe({ 0: { transform: [{ scaleY: 0 }] }, 100: { transform: [{ scaleY: 1 }] } }).duration(420);
const THRESHOLD = 60;

export function HourlyChart({ hours, windows }: { hours: ForecastHour[]; windows: ForecastWindow[] }) {
  const data = hours.slice(0, 24);
  const [selected, setSelected] = useState(0);
  const windowHours = useMemo(() => new Set(windows.flatMap((w) => w.hours.map((h) => h.ts))), [windows]);
  const hour = data[selected] ?? data[0];
  if (!hour) return null;
  const band = scoreBands[scoreBand(hour.score)];
  return (
    <Card style={{ paddingHorizontal: 0, gap: spacing.md }}>
      {/* Readout for the selected hour: score → reasons → confidence */}
      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.sm }} accessibilityLiveRegion="polite">
        <Row justify="space-between" align="flex-end">
          <View>
            <T variant="label" color={colors.inkMuted}>{selected === 0 ? 'Now' : `${formatDay(hour.ts)} · ${shortClock(hour.ts)}`}</T>
            <Row gap={spacing.sm} align="flex-end">
              <T variant="numeralL">{hour.score}</T>
              <T variant="subhead" color={band.color} style={{ marginBottom: 5 }}>{band.label}</T>
            </Row>
          </View>
          <ConfidenceMeter value={hour.confidence} />
        </Row>
        <ReasonChips reasons={hour.reasons} limit={2} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chart} accessibilityLabel="Hourly bite scores for the next 24 hours">
        {data.map((item, index) => {
          const b = scoreBands[scoreBand(item.score)];
          const active = index === selected;
          const inWindow = windowHours.has(item.ts);
          const midnight = new Date(item.ts).getHours() === 0;
          return (
            <Pressable
              key={item.ts}
              onPress={() => {
                if (!active) haptic.select();
                setSelected(index);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${index === 0 ? 'Now' : formatTime(item.ts)}, bite score ${item.score}, ${b.label}${inWindow ? ', inside a window' : ''}`}
              style={[styles.col, active && styles.colActive]}
            >
              <T variant="caption" weight="700" color={active ? colors.onDark : colors.inkSoft} style={{ fontSize: 11 }} maxFontSizeMultiplier={1.2}>{item.score}</T>
              <View style={styles.barArea}>
                <View style={[styles.threshold, { bottom: (THRESHOLD / 100) * CHART_HEIGHT }]} />
                <Animated.View entering={growIn.delay(Math.min(index, 12) * 25)} style={[styles.scoreBar, { height: Math.max(6, (item.score / 100) * CHART_HEIGHT), backgroundColor: active ? b.onDark : b.color, opacity: active || inWindow ? 1 : 0.55 }]} />
              </View>
              <View style={[styles.windowMark, { backgroundColor: inWindow ? colors.sunrise : 'transparent' }]} />
              <T variant="caption" weight={index === 0 ? '800' : '600'} color={active ? colors.onDark : colors.inkMuted} style={{ fontSize: 11 }} maxFontSizeMultiplier={1.2}>
                {index === 0 ? 'Now' : midnight ? new Date(item.ts).toLocaleDateString([], { weekday: 'short' }) : formatHour(item.ts)}
              </T>
            </Pressable>
          );
        })}
      </ScrollView>
      <Row gap={spacing.lg} style={{ paddingHorizontal: spacing.lg }} wrap>
        <Row gap={6}>
          <View style={[styles.legendSwatch, { backgroundColor: colors.sunrise }]} />
          <T variant="caption" color={colors.inkMuted}>Window hours</T>
        </Row>
        <Row gap={6}>
          <View style={styles.legendDash} />
          <T variant="caption" color={colors.inkMuted}>60 = window threshold</T>
        </Row>
        <T variant="caption" color={colors.inkMuted}>Tap an hour for details</T>
      </Row>
    </Card>
  );
}

/* ───────────── 24-hour strip (compact comparison) ───────────── */

/** One row of 24 cells shaded by band; window hours carry a sunrise underline. */
export function DayStrip({ hours, windows, axis = true }: { hours: ForecastHour[]; windows: ForecastWindow[]; axis?: boolean }) {
  const data = hours.slice(0, 24);
  const inWindow = new Set(windows.flatMap((w) => w.hours.map((h) => h.ts)));
  const label = (index: number) => (index === 0 ? 'Now' : formatHour(data[index].ts));
  return (
    <View importantForAccessibility="no-hide-descendants" style={{ gap: 4 }}>
      <View style={styles.strip}>
        {data.map((hour) => {
          const b = scoreBands[scoreBand(hour.score)];
          return (
            <View key={hour.ts} style={{ flex: 1, gap: 2 }}>
              <View style={{ height: 14, borderRadius: 2, backgroundColor: b.color, opacity: 0.25 + (hour.score / 100) * 0.75 }} />
              <View style={{ height: 3, borderRadius: 1, backgroundColor: inWindow.has(hour.ts) ? colors.sunrise : 'transparent' }} />
            </View>
          );
        })}
      </View>
      {axis ? (
        <Row justify="space-between">
          {[0, 6, 12, 18, 23].map((index) => data[index] ? <T key={index} variant="caption" color={colors.inkMuted} style={{ fontSize: 10.5 }} maxFontSizeMultiplier={1.3}>{label(index)}</T> : null)}
        </Row>
      ) : null}
    </View>
  );
}

/* ───────────── Seven-day outlook ───────────── */

export function SevenDayOutlook({ hours }: { hours: ForecastHour[] }) {
  const days = useMemo(() => {
    const groups = new Map<string, ForecastHour[]>();
    hours.forEach((hour) => {
      const d = new Date(hour.ts);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      groups.set(key, [...(groups.get(key) ?? []), hour]);
    });
    return [...groups.values()].slice(0, 7).map((dayHours) => [...dayHours].sort((a, b) => b.score - a.score)[0]);
  }, [hours]);
  return (
    <Card style={{ gap: 0, paddingVertical: spacing.xs }}>
      {days.map((best, index) => {
        const band = scoreBands[scoreBand(best.score)];
        const day = formatDay(best.ts);
        return (
          <View key={best.ts}>
            {index > 0 ? <Divider /> : null}
            <View
              style={styles.dayRow}
              accessible
              accessibilityLabel={`${day}. Best near ${formatTime(best.ts)}, bite score ${best.score}, ${band.label}. ${best.reasons[0] ?? ''}. ${best.confidence} confidence.`}
            >
              <View style={{ width: 92 }}>
                <T variant="subhead">{day.split(',')[0]}</T>
                <T variant="caption" color={colors.inkMuted}>Best {formatHour(best.ts)}</T>
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <Row gap={6}>
                  <Icon name={reasonIcon(best.reasons[0] ?? '')} size={13} color={colors.inkMuted} />
                  <T variant="caption" color={colors.inkSoft} numberOfLines={1} style={{ flex: 1 }}>{best.reasons[0] ?? 'Mixed conditions'}</T>
                </Row>
                <T variant="caption" color={colors.inkMuted}>{best.confidence} confidence</T>
              </View>
              <View style={{ alignItems: 'flex-end', minWidth: 52 }}>
                <T variant="numeralM">{best.score}</T>
                <T variant="caption" weight="700" color={band.color} style={{ fontSize: 11 }}>{band.label}</T>
              </View>
            </View>
          </View>
        );
      })}
    </Card>
  );
}

/* ───────────── Light curve (window detail) ───────────── */

/**
 * Effective underwater light per hour against the walleye comfort band for the lake’s
 * clarity. Explains *why* the window exists without implying certainty.
 */
export function LightCurve({ hours, band }: { hours: ForecastHour[]; band: [number, number] }) {
  const H = 120;
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={styles.curve}>
        {hours.map((hour) => {
          const b = scoreBands[scoreBand(hour.score)];
          const inBand = hour.light >= band[0] && hour.light <= band[1];
          return (
            <View
              key={hour.ts}
              style={styles.curveCol}
              accessible
              accessibilityLabel={`${formatTime(hour.ts)}: light ${Math.round(hour.light * 100)} percent${inBand ? ', inside the walleye comfort band' : ''}, bite score ${hour.score}, ${b.label}`}
            >
              <T variant="caption" weight="700" style={{ fontSize: 11 }} maxFontSizeMultiplier={1.2}>{hour.score}</T>
              <View style={{ height: H, justifyContent: 'flex-end', alignItems: 'center', width: '100%' }}>
                <View style={[styles.comfortBand, { bottom: band[0] * H, height: (band[1] - band[0]) * H }]} />
                <View style={[styles.lightDot, { bottom: hour.light * H - 6, backgroundColor: inBand ? colors.sunrise : colors.inkFaint }]} />
                <View style={[styles.lightStem, { height: Math.max(2, hour.light * H), backgroundColor: inBand ? colors.sunrise : colors.fogDeep }]} />
              </View>
              <T variant="caption" color={colors.inkMuted} style={{ fontSize: 11 }} maxFontSizeMultiplier={1.2}>{formatHour(hour.ts)}</T>
            </View>
          );
        })}
      </View>
      <Row gap={spacing.lg} wrap>
        <Row gap={6}>
          <View style={[styles.legendSwatch, { backgroundColor: colors.tealTint, height: 10, borderWidth: 1, borderColor: colors.teal }]} />
          <T variant="caption" color={colors.inkMuted}>Walleye comfort band</T>
        </Row>
        <Row gap={6}>
          <View style={[styles.legendSwatch, { backgroundColor: colors.sunrise, width: 10, height: 10, borderRadius: 5 }]} />
          <T variant="caption" color={colors.inkMuted}>Light in band</T>
        </Row>
      </Row>
    </View>
  );
}

/* ───────────── Score scale legend ───────────── */

export function ScoreScale() {
  const order = ['slow', 'fair', 'good', 'strong'] as const;
  const ranges = { slow: '0–39', fair: '40–59', good: '60–74', strong: '75+' };
  return (
    <View style={{ gap: spacing.sm }} accessible accessibilityLabel="Bite score scale: Slow 0 to 39, Fair 40 to 59, Good 60 to 74, Strong 75 and above. Windows start at 60.">
      <View style={styles.scale}>
        {order.map((key) => <View key={key} style={{ flex: 1, height: 6, backgroundColor: scoreBands[key].color }} />)}
      </View>
      <Row>
        {order.map((key) => (
          <View key={key} style={{ flex: 1 }}>
            <T variant="caption" weight="700" color={scoreBands[key].color}>{scoreBands[key].label}</T>
            <T variant="caption" color={colors.inkMuted}>{ranges[key]}</T>
          </View>
        ))}
      </Row>
    </View>
  );
}

/* ───────────── Footnotes ───────────── */

export function ForecastFootnote({ engineVersion }: { engineVersion?: string }) {
  return (
    <T variant="caption" color={colors.inkMuted} align="center" style={{ paddingHorizontal: spacing.lg }}>
      Bite scores describe conditions, not a guarantee of fish.{engineVersion ? ` Engine ${engineVersion}.` : ''}
    </T>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', gap: 1.5 },
  scale: { flexDirection: 'row', gap: 2, borderRadius: 3, overflow: 'hidden' },
  readout: { alignItems: 'center', borderRadius: radius.md, gap: 3 },
  readoutLight: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  readoutDark: { backgroundColor: colors.deepRaised, borderWidth: 1, borderColor: colors.deepLine },
  meter: { flexDirection: 'row', gap: 2, marginTop: 2 },
  tick: { width: 4, height: 8, borderRadius: 1 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  bar: { width: 4, borderRadius: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  darkChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.deepRaised, borderWidth: 1, borderColor: colors.deepLine },
  reasonIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.tealMist, alignItems: 'center', justifyContent: 'center' },
  chart: { paddingHorizontal: spacing.md, gap: 2 },
  col: { width: 40, alignItems: 'center', gap: 4, paddingVertical: spacing.sm, borderRadius: radius.sm },
  colActive: { backgroundColor: colors.deep },
  barArea: { height: CHART_HEIGHT, width: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  threshold: { position: 'absolute', left: -1, right: -1, height: 0, borderTopWidth: 1, borderStyle: 'dashed', borderColor: colors.lineStrong },
  scoreBar: { width: 12, borderRadius: 3, transformOrigin: 'bottom' },
  windowMark: { width: 18, height: 3, borderRadius: 2 },
  legendSwatch: { width: 14, height: 3, borderRadius: 2 },
  legendDash: { width: 14, height: 0, borderTopWidth: 1, borderStyle: 'dashed', borderColor: colors.inkFaint },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 60, paddingVertical: spacing.sm },
  curve: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center' },
  comfortBand: { position: 'absolute', left: 0, right: 0, backgroundColor: colors.tealMist, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.tealTint },
  curveCol: { flex: 1, alignItems: 'center', gap: 4, maxWidth: 56 },
  lightDot: { position: 'absolute', width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: colors.paper, zIndex: 2 },
  lightStem: { width: 2, borderRadius: 1 },
});
