import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import type { ForecastHour, ForecastWindow, LakeForecast, Season } from '@bitecast/engine';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { Easing, useAnimatedProps, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import * as SunCalc from 'suncalc';
import { conditionLabel, upcomingWindows, windowEnd } from '@/components/forecast';
import { Icon, type IconName } from '@/components/icon';
import { LakeSchool } from '@/components/lake-school';
import { Toast } from '@/components/toast';
import { Button, EmptyState, ErrorState, IceSafetyNotice, OfflineBanner, Reveal, Row, Screen, SkeletonCard, T } from '@/components/ui';
import { WalleyeArt } from '@/components/walleye';
import { colors, elevation, hitSlop, radius, scoreBand, scoreBands, spacing } from '@/constants/theme';
import { forecastQuery, forecastSource, freshness } from '@/data/forecasts';
import { lakeById } from '@/data/lakes';
import { seasonLabel, useConditionResolver } from '@/features/lake-season';
import { formatDay, formatDuration, formatWind, reasonIcon, shortClock, shortRange } from '@/lib/format';
import { useNow } from '@/lib/use-now';
import { useAppStore } from '@/store/use-app-store';
import type { AppSettings, Lake } from '@/types/app';

/*
 * Today answers, in order: should I go and when (the answer card) → is it comfortable and
 * safe (conditions for that window) → how my other lakes compare → log a trip.
 * The whole screen is a calm lake: a fixed backdrop the content floats over. Fish show
 * mood only (livelier vs lazy) — their number never encodes the forecast.
 */

const MAX_LAKES = 5;
/** Where the waterline sits below the header. */
const WATERLINE = 64;

type LakeData = { lake: Lake; season: Season; forecast: LakeForecast; updatedAt: number; next?: ForecastWindow; live: boolean };

/** Forecast hours from the current hour onward (cached forecasts can start earlier). */
const fromNow = (hours: ForecastHour[], now: number) => {
  const start = hours.findIndex((hour) => new Date(hour.ts).getTime() + 3_600_000 > now);
  return start <= 0 ? hours : hours.slice(start);
};

/** The window to act on for a lake: one open now, else the soonest upcoming. */
function actionable(windows: ForecastWindow[], now: number) {
  const upcoming = upcomingWindows(windows, now);
  const open = upcoming.find((w) => new Date(w.start).getTime() <= now);
  return { next: open ?? upcoming[0], live: Boolean(open) };
}

/** “Today”, “Tomorrow”, else a short weekday. */
const dayLabel = (value: string) => {
  const day = formatDay(value);
  return day === 'Today' || day === 'Tomorrow' ? day : new Date(value).toLocaleDateString([], { weekday: 'short' });
};
const capitalizeFirst = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

export default function TodayScreen() {
  const ids = useAppStore((state) => state.followedLakeIds);
  const units = useAppStore((state) => state.settings.units);
  const resolve = useConditionResolver();
  const seasons = ids.map((id) => resolve(id).season);
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const now = useNow(30_000);
  const queries = useQueries({ queries: ids.map((id, index) => forecastQuery(id, seasons[index])) });

  const refresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['forecast'] }).catch(() => undefined);
    setRefreshing(false);
  };

  const data: LakeData[] = queries
    .flatMap((query, index) => (query.data ? [{ lake: lakeById(ids[index]), season: seasons[index], forecast: query.data, updatedAt: query.dataUpdatedAt, ...actionable(query.data.windows, now) }] : []))
    // Open windows first, then by strength of the next window.
    .sort((a, b) => Number(b.live) - Number(a.live) || (b.next?.peakScore ?? 0) - (a.next?.peakScore ?? 0));
  const loading = queries.some((query) => query.isPending);
  const failed = queries.length > 0 && queries.every((query) => query.isError && !query.data);
  // Latest refresh failure; drives a transient toast instead of a sticky banner.
  const refreshErrorAt = Math.max(0, ...queries.filter((query) => query.isRefetchError).map((query) => query.errorUpdatedAt));
  const fresh = freshness(data.length ? Math.min(...data.map((entry) => entry.updatedAt)) : now, now);
  const best = data[0];
  const others = data.slice(1);
  const broad = best?.forecast.predictionGranularity === 'time_block';
  const nowHour = best ? fromNow(best.forecast.hours, now)[0] : undefined;
  const night = best ? SunCalc.getPosition(new Date(now), best.lake.latitude, best.lake.longitude).altitude <= 0 : false;

  return (
    <View style={{ flex: 1 }}>
      <LakeBackground night={night} score={nowHour?.score ?? 50} ice={best?.season === 'ice'} waterTop={insets.top + WATERLINE} />

      <Screen tab header background="transparent" refreshing={refreshing} onRefresh={refresh}>
        <Header now={now} fresh={fresh} refreshing={refreshing} onRefresh={refresh} top={insets.top} />

        {best ? (
          <>
            <Reveal index={0} style={{ marginTop: spacing.xxl }}>
              <AnswerCard entry={best} now={now} units={units} />
            </Reveal>
            {seasons.includes('ice') ? <IceSafetyNotice compact /> : null}
            <OfflineBanner />

            <Reveal index={1} style={styles.buoys}>
              {others.map((entry) => <Buoy key={entry.lake.id} entry={entry} now={now} />)}
              {ids.length < MAX_LAKES ? (
                <Pressable
                  onPress={() => router.push('/(tabs)/map')}
                  accessibilityRole="button"
                  accessibilityLabel={`Follow another lake. ${ids.length} of ${MAX_LAKES} followed.`}
                  style={({ pressed }) => [styles.followBuoy, pressed && { opacity: 0.6 }]}
                >
                  <Icon name="plus" size={14} color={colors.teal} />
                  <T variant="caption" weight="700" color={colors.teal}>Follow</T>
                </Pressable>
              ) : null}
            </Reveal>
          </>
        ) : (
          <View style={styles.plainBlock}>
            <OfflineBanner />
            {ids.length === 0 ? (
              <EmptyState
                icon="lake"
                art={<WalleyeArt width={200} tone="light" />}
                title="No lakes followed yet"
                body="Follow up to five lakes and Today tells you when and where to go."
                action={<Button icon="map" onPress={() => router.push('/(tabs)/map')}>Find lakes on the map</Button>}
              />
            ) : failed ? (
              <ErrorState title="Forecasts unavailable" body="We couldn’t load forecasts and nothing is saved on this device yet. Check your connection and try again." onRetry={refresh} retrying={refreshing} />
            ) : loading ? (
              <>
                <SkeletonCard lines={5} />
                <SkeletonCard lines={2} />
              </>
            ) : null}
          </View>
        )}

        <View style={styles.footer}>
          <Row gap={6} justify="center">
            <T variant="caption" color={colors.inkSoft}>Conditions, not a guarantee of fish{best ? ` · ${forecastSource(best.forecast)}` : ''}</T>
            {broad ? (
              <Pressable onPress={() => setAboutOpen((open) => !open)} hitSlop={hitSlop} accessibilityRole="button" accessibilityState={{ expanded: aboutOpen }} accessibilityLabel="About broad time blocks">
                <Icon name="info" size={14} color={colors.teal} />
              </Pressable>
            ) : null}
          </Row>
          {broad && aboutOpen ? (
            <T variant="caption" color={colors.inkSoft} align="center" style={{ paddingHorizontal: spacing.lg }}>
              This lake uses broad time-block outlooks. They repeat across the day and don’t identify an exact peak hour.
            </T>
          ) : null}
        </View>
        {/* Room so the floating log button never covers content. */}
        <View style={{ height: 64 }} />
      </Screen>

      {best ? <LogButton lakeId={best.lake.id} /> : null}
      <Toast trigger={refreshErrorAt} icon="sync-error" message="Couldn’t refresh. Showing the forecast saved on this device." actionLabel="Retry" onAction={refresh} />
    </View>
  );
}

/* ───────────── Full-screen lake (fixed; content floats over it) ───────────── */

function LakeBackground({ night, score, ice, waterTop }: { night: boolean; score: number; ice: boolean; waterTop: number }) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const sky = night ? { top: '#BCC9D0', bottom: '#DCE4E4' } : { top: '#D3E5E2', bottom: '#E6EEEA' };
  const water = ice ? { top: '#E4EDEF', bottom: '#C9D8DC' } : { top: '#CFE2E1', bottom: '#A9C8CB' };
  const { width, height } = size;
  const lakeH = Math.max(0, height - waterTop);
  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={(event: LayoutChangeEvent) => setSize({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })}
    >
      {width ? (
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={sky.top} />
              <Stop offset="1" stopColor={sky.bottom} />
            </LinearGradient>
            <LinearGradient id="water" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={water.top} />
              <Stop offset="1" stopColor={water.bottom} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={width} height={waterTop} fill="url(#sky)" />
          <Rect x={0} y={waterTop} width={width} height={lakeH} fill="url(#water)" />
          {[0.12, 0.3, 0.5, 0.7, 0.88].map((t) => {
            const y = waterTop + lakeH * t;
            return <Path key={t} d={`M0 ${y} C${width * 0.25} ${y - 5} ${width * 0.5} ${y + 5} ${width * 0.75} ${y - 3} S${width} ${y + 4} ${width} ${y}`} stroke={colors.white} strokeWidth={1} fill="none" opacity={0.35} />;
          })}
          <Path d={`M0 ${waterTop} L${width} ${waterTop}`} stroke={colors.teal} strokeWidth={1} opacity={0.35} />
          {ice ? <Rect x={0} y={waterTop} width={width} height={8} fill={colors.white} opacity={0.85} /> : null}
        </Svg>
      ) : null}
      {width ? (
        <View style={{ position: 'absolute', top: waterTop, left: 0, width, height: lakeH }}>
          <LakeSchool width={width} top={ice ? 14 : 10} bottom={lakeH - 30} mood={score >= 60 ? 'active' : score >= 40 ? 'idle' : 'sleepy'} count={11} sizeScale={1.15} />
        </View>
      ) : null}
    </View>
  );
}

function Header({ now, fresh, refreshing, onRefresh, top }: { now: number; fresh: { state: 'fresh' | 'aging' | 'stale'; label: string }; refreshing: boolean; onRefresh: () => void; top: number }) {
  const stale = fresh.state === 'stale';
  const date = new Date(now).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  const updated = refreshing ? 'refreshing…' : fresh.label.replace(/^Updated /, 'updated ').replace(/^Forecast is /, '');
  return (
    <Row justify="space-between" align="center" style={{ paddingTop: top - spacing.sm, minHeight: WATERLINE - spacing.sm }}>
      <T variant="title" accessibilityRole="header">Today</T>
      <Pressable
        disabled={!stale || refreshing}
        onPress={onRefresh}
        hitSlop={hitSlop}
        accessibilityRole={stale ? 'button' : 'text'}
        accessibilityLabel={`${date}. ${fresh.label}${stale ? '. Double-tap to refresh' : ''}`}
        style={({ pressed }) => [styles.freshness, pressed && { opacity: 0.6 }]}
      >
        {stale ? <Icon name="refresh" size={12} color={colors.warning} /> : null}
        <T variant="caption" numberOfLines={1}>
          <T variant="caption" weight="700" color={colors.tealDeep}>{date}</T>
          <T variant="caption" color={stale ? colors.warning : colors.inkMuted}> · {updated}</T>
        </T>
      </Pressable>
    </Row>
  );
}

/* ───────────── The answer: when → how good → why → how sure → conditions ───────────── */

function AnswerCard({ entry, now, units }: { entry: LakeData; now: number; units: AppSettings['units'] }) {
  const { lake, season, next, live, forecast } = entry;
  const broad = forecast.predictionGranularity === 'time_block';
  const current = fromNow(forecast.hours, now)[0];
  const score = next?.peakScore ?? current.score;
  const band = scoreBands[scoreBand(score)];
  const reason = (next?.reasons ?? current.reasons)[0] ?? 'Mixed conditions';
  const confidence = next?.confidence ?? current.confidence;
  const status = next
    ? live
      ? `Open · ${formatDuration(new Date(windowEnd(next)).getTime() - now)} left`
      : `${dayLabel(next.start)} · in ${formatDuration(new Date(next.start).getTime() - now)}`
    : 'No window this week';
  // Conditions over the window (or right now when there is none).
  const span = next ? next.hours : [current];
  const wind = avg(span, (h) => h.windKmh);
  const rain = sum(span, (h) => h.precipitationMm);
  const cloud = avg(span, (h) => h.cloudPct);

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/lake/[id]', params: { id: lake.id } })}
      accessibilityRole="button"
      accessibilityHint="Opens the hour-by-hour forecast"
      accessibilityLabel={`${lake.name}, ${seasonLabel(season).toLowerCase()}. ${next ? `${broad ? 'Block' : 'Window'} ${dayLabel(next.start)} ${shortRange(next.start, windowEnd(next))}` : 'No window this week'}. ${status}. ${next ? 'Peak' : 'Now'} bite score ${score}, ${band.label}. ${reason}. ${confidence} confidence. Wind ${formatWind(wind, units)}, ${rainLabel(rain)}, ${cloudLabel(cloud)}, pressure ${pressureTrend(span).toLowerCase()}.`}
      style={({ pressed }) => [styles.card, live && styles.cardLive, pressed && { opacity: 0.94 }]}
    >
      {/* Band-coloured wash: a Good day and a Slow day feel different at a glance */}
      <Svg style={styles.wash} pointerEvents="none">
        <Defs>
          <LinearGradient id="wash" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={band.tint} stopOpacity={1} />
            <Stop offset="1" stopColor={band.tint} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#wash)" />
      </Svg>

      <Row gap={spacing.lg} align="center">
        <View style={{ flex: 1, gap: spacing.xs }}>
          <Row gap={6}>
            <Icon name={season === 'ice' ? 'ice' : 'open-water'} size={14} color={colors.teal} />
            <T variant="subhead" color={colors.inkSoft} numberOfLines={1} style={{ flexShrink: 1 }}>{lake.name}</T>
            <Icon name="chevron-right" size={13} color={colors.inkFaint} />
          </Row>
          <T variant="title" style={{ fontSize: 28, lineHeight: 33 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
            {next ? capitalizeFirst(shortRange(next.start, windowEnd(next))) : conditionLabel(current.score)}
          </T>
          <View style={[styles.statusChip, live && styles.statusChipLive]}>
            {live ? <View style={styles.liveDot} /> : <Icon name="clock" size={12} color={colors.inkSoft} />}
            <T variant="caption" weight="700" color={live ? colors.sunriseInk : colors.inkSoft}>{status}</T>
          </View>
        </View>
        <ScoreRing score={score} caption={next ? 'Peak' : 'Now'} />
      </Row>

      {next ? <WindowTrack window={next} now={now} live={live} /> : null}

      <Row gap={spacing.sm}>
        <Icon name={reasonIcon(reason)} size={15} color={colors.teal} />
        <T variant="callout" style={{ flex: 1 }} numberOfLines={2}>{reason}</T>
        <Bars level={confidence} />
      </Row>

      <View style={styles.chips}>
        <Chip icon="wind" text={formatWind(wind, units)} warn={wind >= 25} />
        <Chip icon="rain" text={rainLabel(rain)} warn={rain >= 2} />
        <Chip icon="cloud" text={cloudLabel(cloud)} />
        <Chip icon="pressure" text={pressureTrend(span)} />
      </View>
    </Pressable>
  );
}

/** Circular score gauge in the band colour; sweeps in on appear (static under reduce motion). */
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const RING = 92;
const RING_STROKE = 8;

function ScoreRing({ score, caption }: { score: number; caption: string }) {
  const band = scoreBands[scoreBand(score)];
  const r = (RING - RING_STROKE) / 2;
  const circumference = 2 * Math.PI * r;
  const reduced = useReducedMotion();
  const progress = useSharedValue(reduced ? score / 100 : 0);
  useEffect(() => {
    progress.set(withTiming(score / 100, { duration: reduced ? 0 : 800, easing: Easing.out(Easing.cubic) }));
  }, [score, reduced, progress]);
  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: circumference * (1 - progress.get()) }));
  return (
    <View style={styles.ring} importantForAccessibility="no-hide-descendants">
      <Svg width={RING} height={RING} style={StyleSheet.absoluteFill}>
        <Circle cx={RING / 2} cy={RING / 2} r={r} stroke={colors.fog} strokeWidth={RING_STROKE} fill="none" />
        <AnimatedCircle
          cx={RING / 2}
          cy={RING / 2}
          r={r}
          stroke={band.color}
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          animatedProps={animatedProps}
          fill="none"
          transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
        />
      </Svg>
      <T variant="label" color={colors.inkMuted} style={{ fontSize: 8.5, lineHeight: 10 }}>{caption}</T>
      <T variant="numeralL" style={{ lineHeight: 36 }}>{score}</T>
      <T variant="caption" weight="800" color={band.color} style={{ fontSize: 11, lineHeight: 13 }}>{band.label}</T>
    </View>
  );
}

/** Visual countdown: Now → the window as a glowing segment on a short time track. */
function WindowTrack({ window, now, live }: { window: ForecastWindow; now: number; live: boolean }) {
  const start = new Date(window.start).getTime();
  const end = new Date(windowEnd(window)).getTime();
  const spanMs = Math.min(48, Math.max(24, (end - now) / 3_600_000 + 3)) * 3_600_000;
  const at = (t: number) => Math.min(1, Math.max(0, (t - now) / spanMs));
  const s = at(start);
  const e = Math.max(s + 0.03, at(end));
  const close = e - s < 0.22;
  return (
    <View style={{ gap: 4 }} importantForAccessibility="no-hide-descendants">
      <View style={styles.track}>
        <View style={[styles.trackWindow, { left: `${s * 100}%`, width: `${(e - s) * 100}%` }]} />
        <View style={[styles.trackNow, live && { backgroundColor: colors.sunrise }]} />
      </View>
      <View style={{ height: 15 }}>
        <T variant="caption" color={colors.inkMuted} style={[styles.trackLabel, styles.trackLabelNow]}>Now</T>
        {close || live ? (
          <T variant="caption" weight="700" color={colors.sunriseInk} style={[styles.trackLabel, { left: `${Math.min(0.72, Math.max(0.2, s)) * 100}%` }]} numberOfLines={1}>
            {live ? `until ${shortClock(windowEnd(window))}` : shortRange(window.start, windowEnd(window))}
          </T>
        ) : (
          <>
            <T variant="caption" weight="700" color={colors.sunriseInk} style={[styles.trackLabel, { left: `${Math.min(0.8, Math.max(0.2, s)) * 100}%` }]} numberOfLines={1}>{shortClock(window.start)}</T>
            <T variant="caption" weight="700" color={colors.sunriseInk} style={[styles.trackLabel, { left: `${Math.min(0.86, e) * 100}%` }]} numberOfLines={1}>{shortClock(windowEnd(window))}</T>
          </>
        )}
      </View>
    </View>
  );
}

function Chip({ icon, text, warn }: { icon: IconName; text: string; warn?: boolean }) {
  return (
    <View style={[styles.chip, warn && styles.chipWarn]}>
      <Icon name={icon} size={14} color={warn ? colors.warning : colors.teal} />
      <T variant="caption" weight="700" color={warn ? colors.warning : colors.inkSoft} numberOfLines={1}>{text}</T>
    </View>
  );
}

const avg = (hours: ForecastHour[], pick: (h: ForecastHour) => number) => hours.reduce((total, h) => total + pick(h), 0) / Math.max(1, hours.length);
const sum = (hours: ForecastHour[], pick: (h: ForecastHour) => number) => hours.reduce((total, h) => total + pick(h), 0);
const rainLabel = (mm: number) => (mm < 0.2 ? 'Dry' : `${Math.round(mm * 10) / 10} mm`);
const cloudLabel = (pct: number) => (pct < 25 ? 'Clear' : pct < 70 ? 'Partly cloudy' : 'Overcast');
const pressureTrend = (hours: ForecastHour[]) => {
  if (hours.length < 2) return 'Steady';
  const delta = hours[hours.length - 1].pressureHpa - hours[0].pressureHpa;
  return delta > 1 ? 'Rising' : delta < -1 ? 'Falling' : 'Steady';
};

const barLevel = { High: 3, Medium: 2, Low: 1 } as const;
/** Compact confidence: three bars (+ level word unless `bare`). */
function Bars({ level, bare }: { level: 'High' | 'Medium' | 'Low'; bare?: boolean }) {
  return (
    <Row gap={4} importantForAccessibility="no-hide-descendants">
      <View style={styles.bars}>
        {[1, 2, 3].map((bar) => <View key={bar} style={[styles.bar, { height: 3 + bar * 3, backgroundColor: bar <= barLevel[level] ? colors.teal : colors.fogDeep }]} />)}
      </View>
      {bare ? null : <T variant="caption" color={colors.inkMuted}>{level}</T>}
    </Row>
  );
}

/* ───────────── Other lakes as buoys floating in the lake ───────────── */

function Buoy({ entry, now }: { entry: LakeData; now: number }) {
  const { lake, next, live, forecast, season } = entry;
  const current = fromNow(forecast.hours, now)[0];
  const score = next?.peakScore ?? current.score;
  const band = scoreBands[scoreBand(score)];
  const when = next ? (live ? 'Open now' : `${dayLabel(next.start)} ${shortClock(next.start)}`) : 'No window';
  const reason = (next?.reasons ?? current.reasons)[0] ?? 'Mixed conditions';
  const confidence = next?.confidence ?? current.confidence;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/lake/[id]', params: { id: lake.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${lake.name}, ${seasonLabel(season).toLowerCase()}. ${next ? `${live ? 'Window open now' : `Next window ${formatDay(next.start)} ${shortRange(next.start, windowEnd(next))}`}` : 'No window this week'}. ${next ? 'Peak' : 'Now'} bite score ${score}, ${band.label}. ${reason}. ${confidence} confidence.`}
      accessibilityHint="Opens the lake forecast"
      style={({ pressed }) => [styles.buoy, pressed && { opacity: 0.8 }]}
    >
      <View style={[styles.buoyScore, { backgroundColor: band.tint, borderColor: band.color }]}>
        <T variant="numeralS" color={colors.ink} style={{ fontSize: 14 }}>{score}</T>
      </View>
      <View style={{ gap: 1, flexShrink: 1 }}>
        <T variant="caption" weight="800" color={colors.ink} numberOfLines={1}>{lake.name}</T>
        <Row gap={5}>
          <Icon name={reasonIcon(reason)} size={11} color={colors.teal} />
          <T variant="caption" color={live ? colors.sunriseInk : colors.inkMuted} weight={live ? '700' : '500'} style={{ fontSize: 11.5 }} numberOfLines={1}>{when}</T>
          <Bars level={confidence} bare />
        </Row>
      </View>
    </Pressable>
  );
}

/* ───────────── Floating log button ───────────── */

function LogButton({ lakeId }: { lakeId: string }) {
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/log/new', params: { lakeId } })}
      accessibilityRole="button"
      accessibilityLabel="Log a trip"
      accessibilityHint="Catch and no-catch trips both count"
      hitSlop={hitSlop}
      style={({ pressed }) => [styles.fab, pressed && { transform: [{ scale: 0.95 }] }]}
    >
      <Icon name="plus" size={24} color={colors.onDark} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  freshness: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1, marginLeft: spacing.md },
  card: { gap: spacing.md, padding: spacing.lg, borderRadius: radius.xl, backgroundColor: colors.white, overflow: 'hidden', ...elevation.raised },
  cardLive: { borderWidth: 1.5, borderColor: colors.sunrise },
  wash: { position: 'absolute', top: 0, left: 0, right: 0, height: 120 },
  statusChip: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginTop: 2, paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: 'rgba(231,234,228,0.9)' },
  statusChipLive: { backgroundColor: colors.sunriseTint },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.sunrise },
  ring: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.fog, justifyContent: 'center' },
  trackWindow: { position: 'absolute', top: 0, bottom: 0, borderRadius: 4, backgroundColor: colors.sunrise, shadowColor: colors.sunrise, shadowOpacity: 0.6, shadowRadius: 5, shadowOffset: { width: 0, height: 0 } },
  trackNow: { position: 'absolute', left: -2, width: 12, height: 12, borderRadius: 6, backgroundColor: colors.ink, borderWidth: 2, borderColor: colors.white },
  trackLabel: { position: 'absolute', top: 0, width: 72, marginLeft: -36, textAlign: 'center', fontSize: 11 },
  trackLabelNow: { left: 0, marginLeft: 0, textAlign: 'left' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.tealMist },
  chipWarn: { backgroundColor: colors.warningTint },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  bar: { width: 3, borderRadius: 1 },
  buoys: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  buoy: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, maxWidth: '100%', paddingVertical: 6, paddingLeft: 6, paddingRight: spacing.md, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.94)', ...elevation.low },
  buoyScore: { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  followBuoy: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 46, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.teal, backgroundColor: 'rgba(255,255,255,0.55)' },
  plainBlock: { gap: spacing.lg, marginTop: spacing.xxl, padding: spacing.lg, borderRadius: radius.xl, backgroundColor: colors.paper },
  footer: { gap: spacing.xs, alignItems: 'center', alignSelf: 'center', marginTop: spacing.lg, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: 'rgba(251,250,245,0.7)' },
  fab: { position: 'absolute', right: spacing.xl, bottom: spacing.lg, width: 58, height: 58, borderRadius: 29, backgroundColor: colors.deep, alignItems: 'center', justifyContent: 'center', ...elevation.raised },
});
