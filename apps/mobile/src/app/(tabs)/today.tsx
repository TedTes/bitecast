import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import type { ForecastHour, ForecastWindow, LakeForecast, Season } from '@bitecast/engine';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { Easing, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
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
        <Header now={now} fresh={fresh} refreshing={refreshing} onRefresh={refresh} top={insets.top} aboutOpen={aboutOpen} onAbout={() => setAboutOpen((open) => !open)} />
        {aboutOpen ? (
          <Reveal style={styles.about}>
            <T variant="caption" color={colors.inkSoft}>
              Bite scores describe conditions, not a guarantee of fish.{best ? ` Source: ${forecastSource(best.forecast)}.` : ''}
              {broad ? ' This lake uses broad time-block outlooks; they repeat across the day and don’t identify an exact peak hour.' : ''}
            </T>
          </Reveal>
        ) : null}

        {best ? (
          <>
            <Reveal index={0} style={{ marginTop: spacing.xxl }}>
              <AnswerCard entry={best} now={now} units={units} />
            </Reveal>
            {seasons.includes('ice') ? <IceSafetyNotice compact /> : null}
            <OfflineBanner />
            {others.length ? (
              <Reveal index={2} style={{ gap: spacing.sm }}>
                <T variant="label" color={colors.inkSoft} accessibilityRole="header">Other lakes</T>
                {others.map((entry) => <LakeCard key={entry.lake.id} entry={entry} now={now} />)}
              </Reveal>
            ) : null}
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

      </Screen>

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
          <LakeBed width={width} height={height} />
        </Svg>
      ) : null}
      {width ? <LightShafts width={width} top={waterTop} height={lakeH} /> : null}
      {width ? <Bubbles width={width} bottom={BED * 0.6} rise={lakeH * 0.55} /> : null}
      {width ? <Weeds width={width} bottom={BED * 0.55} /> : null}
      {width ? (
        <View style={{ position: 'absolute', top: waterTop, left: 0, width, height: lakeH }}>
          {/* Fish favour the open lower water, between the content and the lake bed. */}
          <LakeSchool width={width} top={lakeH * 0.4} bottom={lakeH - BED * 0.6} mood={score >= 60 ? 'active' : score >= 40 ? 'idle' : 'sleepy'} count={8} sizeScale={1.45} visibility={1.25} />
        </View>
      ) : null}
    </View>
  );
}

/* ───────────── Lake bed: sand, a few rocks and slowly swaying weeds (decorative) ───────────── */

const BED = 92;

function LakeBed({ width, height }: { width: number; height: number }) {
  const top = height - BED;
  const sand = `M0 ${top + 34} C${width * 0.18} ${top + 18} ${width * 0.32} ${top + 40} ${width * 0.5} ${top + 28} S${width * 0.82} ${top + 14} ${width} ${top + 30} L${width} ${height} L0 ${height} Z`;
  const back = `M0 ${top + 18} C${width * 0.22} ${top + 4} ${width * 0.45} ${top + 26} ${width * 0.66} ${top + 12} S${width * 0.9} ${top + 2} ${width} ${top + 14} L${width} ${height} L0 ${height} Z`;
  const rocks = [
    { x: 0.12, w: 34, h: 16 },
    { x: 0.2, w: 18, h: 10 },
    { x: 0.58, w: 42, h: 18 },
    { x: 0.66, w: 20, h: 11 },
    { x: 0.9, w: 28, h: 14 },
  ];
  return (
    <>
      <Defs>
        <LinearGradient id="sand" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#CBC4AA" />
          <Stop offset="1" stopColor="#B7AF92" />
        </LinearGradient>
      </Defs>
      <Path d={back} fill="#9FBFC0" opacity={0.55} />
      {rocks.map((rock) => (
        <Path
          key={rock.x}
          d={`M${rock.x * width - rock.w / 2} ${top + 32} q${rock.w * 0.1} ${-rock.h} ${rock.w / 2} ${-rock.h} q${rock.w * 0.4} 0 ${rock.w / 2} ${rock.h} Z`}
          fill="#8EA6A5"
          opacity={0.75}
        />
      ))}
      <Path d={sand} fill="url(#sand)" opacity={0.9} />
    </>
  );
}

/** A few weeds rooted in the bed, each swaying on its own slow rhythm (still under reduce motion). */
function Weeds({ width, bottom }: { width: number; bottom: number }) {
  const [weeds] = useState(() =>
    [0.05, 0.09, 0.27, 0.31, 0.47, 0.73, 0.77, 0.95].map((x, i) => ({ x, height: 26 + ((i * 37) % 30), period: 2600 + ((i * 613) % 1600), delay: (i * 271) % 900 })),
  );
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {weeds.map((weed) => <Weed key={weed.x} left={weed.x * width} bottom={bottom} height={weed.height} period={weed.period} delay={weed.delay} />)}
    </View>
  );
}

function Weed({ left, bottom, height, period, delay }: { left: number; bottom: number; height: number; period: number; delay: number }) {
  const reduced = useReducedMotion();
  const sway = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    sway.set(withDelay(delay, withRepeat(withSequence(withTiming(1, { duration: period, easing: Easing.inOut(Easing.sin) }), withTiming(-1, { duration: period, easing: Easing.inOut(Easing.sin) })), -1, true)));
  }, [reduced, sway, period, delay]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${sway.get() * 7}deg` }] }));
  const w = 18;
  return (
    <Animated.View style={[styles.weed, { left: left - w / 2, bottom, width: w, height }, style]}>
      <Svg width={w} height={height}>
        <Path d={`M${w / 2} ${height} C${w * 0.1} ${height * 0.7} ${w * 0.9} ${height * 0.4} ${w / 2} 0`} stroke="#5E8F86" strokeWidth={3} strokeLinecap="round" fill="none" opacity={0.7} />
        <Path d={`M${w / 2} ${height * 0.62} q${-w * 0.45} ${-height * 0.06} ${-w * 0.4} ${-height * 0.2}`} stroke="#6E9C92" strokeWidth={2.5} strokeLinecap="round" fill="none" opacity={0.6} />
        <Path d={`M${w / 2} ${height * 0.38} q${w * 0.45} ${-height * 0.05} ${w * 0.38} ${-height * 0.18}`} stroke="#6E9C92" strokeWidth={2.5} strokeLinecap="round" fill="none" opacity={0.6} />
      </Svg>
    </Animated.View>
  );
}

/** Soft sunlight shafts slanting down from the surface, with a slow shimmer. */
function LightShafts({ width, top, height }: { width: number; top: number; height: number }) {
  const reduced = useReducedMotion();
  const shimmer = useSharedValue(0.5);
  useEffect(() => {
    if (!reduced) shimmer.set(withRepeat(withSequence(withTiming(1, { duration: 4200, easing: Easing.inOut(Easing.sin) }), withTiming(0.35, { duration: 4200, easing: Easing.inOut(Easing.sin) })), -1, true));
  }, [reduced, shimmer]);
  const style = useAnimatedStyle(() => ({ opacity: shimmer.get() }));
  const shafts = [0.18, 0.46, 0.78].map((x, i) => ({ x: x * width, w: 46 + i * 14, lean: 70 + i * 20 }));
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Svg width={width} height={top + height}>
        <Defs>
          <LinearGradient id="shaft" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.white} stopOpacity={0.32} />
            <Stop offset="1" stopColor={colors.white} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        {shafts.map((shaft) => (
          <Path key={shaft.x} d={`M${shaft.x} ${top} L${shaft.x + shaft.w} ${top} L${shaft.x + shaft.w + shaft.lean} ${top + height * 0.75} L${shaft.x + shaft.lean - 10} ${top + height * 0.75} Z`} fill="url(#shaft)" />
        ))}
      </Svg>
    </Animated.View>
  );
}

/** A few bubbles drifting up from the weeds (none under reduce motion). */
function Bubbles({ width, bottom, rise }: { width: number; bottom: number; rise: number }) {
  const reduced = useReducedMotion();
  const [bubbles] = useState(() => [0.08, 0.3, 0.5, 0.75, 0.94].map((x, i) => ({ x, size: 4 + (i % 3) * 2, duration: 6000 + i * 1300, delay: i * 1700 })));
  if (reduced) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {bubbles.map((bubble) => <Bubble key={bubble.x} left={bubble.x * width} bottom={bottom} rise={rise} {...bubble} />)}
    </View>
  );
}

function Bubble({ left, bottom, rise, size, duration, delay }: { left: number; bottom: number; rise: number; size: number; duration: number; delay: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(withDelay(delay, withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1, false)));
  }, [t, duration, delay]);
  const style = useAnimatedStyle(() => ({
    opacity: t.get() < 0.1 ? t.get() * 6 : 0.6 * (1 - t.get()),
    transform: [{ translateY: -t.get() * rise }, { translateX: Math.sin(t.get() * 12) * 4 }],
  }));
  return <Animated.View style={[styles.bubble, { left, bottom, width: size, height: size, borderRadius: size / 2 }, style]} />;
}

function Header({ now, fresh, refreshing, onRefresh, top, aboutOpen, onAbout }: { now: number; fresh: { state: 'fresh' | 'aging' | 'stale'; label: string }; refreshing: boolean; onRefresh: () => void; top: number; aboutOpen: boolean; onAbout: () => void }) {
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
      <Pressable onPress={onAbout} hitSlop={hitSlop} accessibilityRole="button" accessibilityState={{ expanded: aboutOpen }} accessibilityLabel="About this forecast" style={{ marginLeft: spacing.sm }}>
        <Icon name="info" size={16} color={aboutOpen ? colors.teal : colors.inkMuted} />
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
    <View style={{ gap: spacing.md }}>
    <Pressable
      onPress={() => router.push({ pathname: '/lake/[id]', params: { id: lake.id } })}
      accessibilityRole="button"
      accessibilityHint="Opens the hour-by-hour forecast"
      accessibilityLabel={`${lake.name}, ${seasonLabel(season).toLowerCase()}. ${next ? `${broad ? 'Block' : 'Window'} ${dayLabel(next.start)} ${shortRange(next.start, windowEnd(next))}` : 'No window this week'}. ${status}. ${next ? 'Peak' : 'Now'} bite score ${score}, ${band.label}.`}
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
    </Pressable>

    {/* Second card: why (reason + confidence) and what it will be like out there */}
    <View style={styles.conditionsCard} accessible accessibilityLabel={`${reason}. ${confidence} confidence. Wind ${formatWind(wind, units)}, ${rainLabel(rain)}, ${cloudLabel(cloud)}, pressure ${pressureTrend(span).toLowerCase()}.`}>
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
    </View>
    </View>
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
  // Label positions after clamping; merge into one label when they'd overlap.
  const startAt = Math.min(0.8, Math.max(0.2, s));
  const endAt = Math.min(0.86, e);
  const close = endAt - startAt < 0.26;
  return (
    <View style={{ gap: 4 }} importantForAccessibility="no-hide-descendants">
      <View style={styles.track}>
        <View style={[styles.trackWindow, { left: `${s * 100}%`, width: `${(e - s) * 100}%` }]} />
        <View style={[styles.trackNow, live && { backgroundColor: colors.sunrise }]} />
      </View>
      <View style={{ height: 15 }}>
        <T variant="caption" color={colors.inkMuted} style={[styles.trackLabel, styles.trackLabelNow]}>Now</T>
        {close || live ? (
          <T variant="caption" weight="700" color={colors.sunriseInk} style={[styles.trackLabel, styles.trackLabelWide, { left: `${Math.min(0.68, Math.max(0.24, (startAt + endAt) / 2)) * 100}%` }]} numberOfLines={1}>
            {live ? `until ${shortClock(windowEnd(window))}` : shortRange(window.start, windowEnd(window))}
          </T>
        ) : (
          <>
            <T variant="caption" weight="700" color={colors.sunriseInk} style={[styles.trackLabel, { left: `${startAt * 100}%` }]} numberOfLines={1}>{shortClock(window.start)}</T>
            <T variant="caption" weight="700" color={colors.sunriseInk} style={[styles.trackLabel, { left: `${endAt * 100}%` }]} numberOfLines={1}>{shortClock(windowEnd(window))}</T>
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

/* ───────────── Other lakes: full-width cards, ranked ───────────── */

function LakeCard({ entry, now }: { entry: LakeData; now: number }) {
  const { lake, next, live, forecast, season } = entry;
  const current = fromNow(forecast.hours, now)[0];
  const score = next?.peakScore ?? current.score;
  const band = scoreBands[scoreBand(score)];
  const when = next ? (live ? `Open now · until ${shortClock(windowEnd(next))}` : `${dayLabel(next.start)} ${shortRange(next.start, windowEnd(next))}`) : 'No window this week';
  const reason = (next?.reasons ?? current.reasons)[0] ?? 'Mixed conditions';
  const confidence = next?.confidence ?? current.confidence;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/lake/[id]', params: { id: lake.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${lake.name}, ${seasonLabel(season).toLowerCase()}. ${when}. ${next ? 'Peak' : 'Now'} bite score ${score}, ${band.label}. ${reason}. ${confidence} confidence.`}
      accessibilityHint="Opens the lake forecast"
      style={({ pressed }) => [styles.lakeCard, pressed && { opacity: 0.85 }]}
    >
      <View style={[styles.lakeScore, { backgroundColor: band.tint, borderColor: band.color }]}>
        <T variant="numeralM" color={colors.ink}>{score}</T>
        <T variant="caption" weight="800" color={band.color} style={{ fontSize: 10, lineHeight: 12 }}>{band.label}</T>
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Row gap={6}>
          <Icon name={season === 'ice' ? 'ice' : 'open-water'} size={13} color={colors.teal} />
          <T variant="subhead" numberOfLines={1} style={{ flexShrink: 1 }}>{lake.name}</T>
        </Row>
        <T variant="callout" weight="700" color={live ? colors.sunriseInk : colors.ink} numberOfLines={1}>{when}</T>
        <Row gap={spacing.sm}>
          <Icon name={reasonIcon(reason)} size={12} color={colors.teal} />
          <T variant="caption" color={colors.inkMuted} numberOfLines={1} style={{ flex: 1 }}>{reason}</T>
          <Bars level={confidence} bare />
        </Row>
      </View>
      <Icon name="chevron-right" size={16} color={colors.inkFaint} />
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
  trackLabelWide: { width: 120, marginLeft: -60 },
  trackLabelNow: { left: 0, marginLeft: 0, textAlign: 'left' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.tealMist },
  chipWarn: { backgroundColor: colors.warningTint },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  bar: { width: 3, borderRadius: 1 },
  conditionsCard: { gap: spacing.md, padding: spacing.lg, borderRadius: radius.xl, backgroundColor: colors.white, ...elevation.low },
  lakeCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: radius.xl, backgroundColor: colors.white, ...elevation.low },
  lakeScore: { width: 58, height: 58, borderRadius: radius.md, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  about: { padding: spacing.md, borderRadius: radius.md, backgroundColor: 'rgba(251,250,245,0.92)' },
  plainBlock: { gap: spacing.lg, marginTop: spacing.xxl, padding: spacing.lg, borderRadius: radius.xl, backgroundColor: colors.paper },
  weed: { position: 'absolute', transformOrigin: 'bottom' },
  bubble: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(255,255,255,0.9)', backgroundColor: 'rgba(255,255,255,0.25)' },
});
