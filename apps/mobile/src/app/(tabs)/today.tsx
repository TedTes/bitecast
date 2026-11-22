import { useCallback, useState } from 'react';
import { router, useFocusEffect, useIsFocused } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import type { ForecastHour, ForecastWindow, LakeForecast, Season } from '@bitecast/engine';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import * as SunCalc from 'suncalc';
import { conditionLabel, upcomingWindows, windowEnd } from '@/components/forecast';
import { Icon, type IconName } from '@/components/icon';
import { LAKE_FLOOR, LakeScene, ORB, SHORE, SKY_SPACE, SURFACE, orbTop } from '@/components/lake-scene';
import { ConfidenceBars } from '@/components/score-ring';
import { Toast } from '@/components/toast';
import { Button, EmptyState, ErrorState, IceSafetyNotice, OfflineBanner, Reveal, Row, SkeletonCard, T } from '@/components/ui';
import { WalleyeArt } from '@/components/walleye';
import { colors, hitSlop, radius, scoreBand, scoreBands, spacing, touch } from '@/constants/theme';
import { forecastQuery, forecastSource, freshness, type Freshness } from '@/data/forecasts';
import { lakeById } from '@/data/lakes';
import { seasonLabel, useConditionResolver } from '@/features/lake-season';
import { onScene, skyPalette, type SkyPalette } from '@/features/sky';
import { capitalize, formatDay, formatDuration, formatWind, reasonIcon, shortClock, shortRange } from '@/lib/format';
import { useNow } from '@/lib/use-now';
import { useAppStore } from '@/store/use-app-store';
import type { AppSettings, Lake } from '@/types/app';

/*
 * Today, top to bottom: when (ticket in the sky) → how good (the sun or moon) → where that
 * falls in the next 24 h (shoreline) → why, how sure and what it’s like (water) → other lakes
 * (sign). The scene follows the lake’s sun altitude and forecast weather. Fish show mood only.
 */

const HEADER = 44;
const HOUR = 3_600_000;
/** Southern Ontario: lights the scene before any lake is followed. */
const DEFAULT_PLACE = { latitude: 44.2, longitude: -78.4 };

type LakeData = { lake: Lake; season: Season; forecast: LakeForecast; updatedAt: number; next?: ForecastWindow; live: boolean };

/** Forecast hours from the current hour onward (cached forecasts can start earlier). */
const fromNow = (hours: ForecastHour[], now: number) => {
  const start = hours.findIndex((hour) => new Date(hour.ts).getTime() + HOUR > now);
  return start <= 0 ? hours : hours.slice(start);
};

/** The window to act on for a lake: one open now, else the soonest upcoming. */
function actionable(windows: ForecastWindow[], now: number) {
  const upcoming = upcomingWindows(windows, now);
  const open = upcoming.find((w) => new Date(w.start).getTime() <= now);
  return { next: open ?? upcoming[0], live: Boolean(open) };
}

/** What a lake’s forecast says for its window, or for right now when there is none. */
function outlook({ next, forecast }: LakeData, now: number) {
  const current = fromNow(forecast.hours, now)[0];
  return {
    score: next?.peakScore ?? current.score,
    reason: (next?.reasons ?? current.reasons)[0] ?? 'Mixed conditions',
    confidence: next?.confidence ?? current.confidence,
    span: next?.hours ?? [current],
    caption: !next ? 'Now' : forecast.predictionGranularity === 'time_block' ? 'Block' : 'Peak',
  };
}

/** “Today”, “Tomorrow”, else a short weekday. */
const dayLabel = (value: string) => {
  const day = formatDay(value);
  return day === 'Today' || day === 'Tomorrow' ? day : new Date(value).toLocaleDateString([], { weekday: 'short' });
};

const openLake = (id: string) => router.push({ pathname: '/lake/[id]', params: { id } });

export default function TodayScreen() {
  const ids = useAppStore((state) => state.followedLakeIds);
  const units = useAppStore((state) => state.settings.units);
  const resolve = useConditionResolver();
  const seasons = ids.map((id) => resolve(id).season);
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  // The scene is drawn from measured layout, so it lines up with the content at any text size.
  const [page, setPage] = useState({ width: 0, height: 0 });
  const [horizon, setHorizon] = useState(0);
  const [contentBottom, setContentBottom] = useState(0);
  const now = useNow(30_000);
  // Tabs stay mounted: the lake only animates while Today is on screen.
  const focused = useIsFocused();
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.set(event.contentOffset.y);
  });
  // The sky is dark at the top at every hour, so the status bar is light while Today shows.
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      return () => setStatusBarStyle('dark');
    }, []),
  );
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
  const fresh = data.length ? freshness(Math.min(...data.map((entry) => entry.updatedAt)), now) : undefined;
  const best = data[0];
  const nowHour = best ? fromNow(best.forecast.hours, now)[0] : undefined;

  const place = best?.lake ?? DEFAULT_PLACE;
  const altitude = SunCalc.getPosition(new Date(now), place.latitude, place.longitude).altitude; // degrees
  const ice = best?.season === 'ice';
  const weather = { cloudPct: nowHour?.cloudPct ?? 20, windKmh: nowHour?.windKmh ?? 8, rainMm: nowHour?.precipitationMm ?? 0 };
  const palette = skyPalette(altitude, weather.cloudPct, ice);
  const nowScore = nowHour?.score ?? 50;

  return (
    <View style={{ flex: 1, backgroundColor: palette.sandDark }}>
      {/* What shows when the scroll view is pulled past the top */}
      <View style={[styles.overscroll, { backgroundColor: palette.top }]} />
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{ flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} progressViewOffset={insets.top} tintColor={onScene.text} colors={[colors.teal]} />}
      >
        <View style={styles.page} onLayout={({ nativeEvent: { layout } }) => setPage({ width: layout.width, height: layout.height })}>
          {page.width && horizon ? (
            <LakeScene
              width={page.width}
              height={page.height}
              headerBottom={insets.top + HEADER + spacing.lg}
              horizon={horizon}
              contentBottom={contentBottom}
              altitude={altitude}
              palette={palette}
              weather={weather}
              moon={SunCalc.getMoonIllumination(new Date(now))}
              ice={ice}
              mood={nowScore >= 60 ? 'active' : nowScore >= 40 ? 'idle' : 'sleepy'}
              active={focused}
              scrollY={scrollY}
            />
          ) : null}

          <View style={[styles.content, { paddingTop: insets.top }]}>
            <Header now={now} fresh={fresh} refreshing={refreshing} onRefresh={refresh} aboutOpen={aboutOpen} onAbout={() => setAboutOpen((open) => !open)} />
            {aboutOpen ? (
              <Reveal style={styles.about}>
                <T variant="caption" color={onScene.text}>
                  Bite scores describe conditions, not a guarantee of fish.{best ? ` Source: ${forecastSource(best.forecast)}.` : ''}
                  {best?.forecast.predictionGranularity === 'time_block' ? ' This lake uses broad time-block outlooks; they repeat across the day and don’t identify an exact peak hour.' : ''}
                </T>
              </Reveal>
            ) : null}

            {best ? <Ticket entry={best} now={now} /> : null}

            <View style={styles.skySpace} onLayout={({ nativeEvent: { layout } }) => setHorizon(layout.y + layout.height)}>
              {best ? (
                <>
                  <OrbScore {...outlook(best, now)} top={orbTop(altitude)} palette={palette} />
                  <ShoreTimeline entry={best} now={now} />
                </>
              ) : null}
            </View>

            <View style={styles.water}>
              {best ? (
                <>
                  <Conditions {...outlook(best, now)} units={units} />
                  {seasons.includes('ice') ? <IceSafetyNotice compact /> : null}
                  <OfflineBanner />
                  <Signpost best={best} others={data.slice(1)} now={now} />
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
                    <SkeletonCard lines={4} />
                  ) : null}
                </View>
              )}
            </View>

            {/* Open water below the last card: where the fish and the lake bed are */}
            <View style={styles.floor} onLayout={({ nativeEvent: { layout } }) => setContentBottom(layout.y)} />
          </View>
        </View>
      </Animated.ScrollView>

      <Toast trigger={refreshErrorAt} icon="sync-error" message="Couldn’t refresh. Showing the forecast saved on this device." actionLabel="Retry" onAction={refresh} />
    </View>
  );
}

function Header({ now, fresh, refreshing, onRefresh, aboutOpen, onAbout }: { now: number; fresh?: Freshness; refreshing: boolean; onRefresh: () => void; aboutOpen: boolean; onAbout: () => void }) {
  const stale = fresh?.state === 'stale';
  const date = new Date(now).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  return (
    <Row justify="space-between" align="center" style={{ minHeight: HEADER }}>
      <T variant="title" color={onScene.text} accessibilityRole="header" accessibilityLabel={`Today, ${date}`}>Today</T>
      <Row gap={spacing.md} align="center" style={{ flexShrink: 1 }}>
        {fresh ? (
          <Pressable
            disabled={!stale || refreshing}
            onPress={onRefresh}
            hitSlop={hitSlop}
            accessibilityRole={stale ? 'button' : 'text'}
            accessibilityLabel={`${fresh.label}${stale ? '. Double-tap to refresh' : ''}`}
            style={({ pressed }) => [styles.freshness, pressed && styles.pressed]}
          >
            {stale ? <Icon name="refresh" size={12} color={onScene.accent} /> : null}
            <T variant="caption" weight="700" color={stale ? onScene.accent : onScene.text} numberOfLines={1} style={{ flexShrink: 1 }}>
              {refreshing ? 'Refreshing…' : fresh.label.replace(/^Forecast is /, '')}
            </T>
          </Pressable>
        ) : null}
        <Pressable onPress={onAbout} hitSlop={hitSlop} accessibilityRole="button" accessibilityState={{ expanded: aboutOpen }} accessibilityLabel="About this forecast" style={styles.info}>
          <Icon name="info" size={19} color={aboutOpen ? onScene.accent : onScene.text} />
        </Pressable>
      </Row>
    </Row>
  );
}

/* ───────────── Sky: when and how good ───────────── */

function Ticket({ entry, now }: { entry: LakeData; now: number }) {
  const { lake, season, next, live, forecast } = entry;
  const kind = forecast.predictionGranularity === 'time_block' ? 'block' : 'window';
  const range = next ? shortRange(next.start, windowEnd(next)) : '';
  const wait = next ? formatDuration(new Date(live ? windowEnd(next) : next.start).getTime() - now) : '';
  const detail = !next ? 'No window this week' : live ? `Current ${kind}` : `Next ${kind} · ${dayLabel(next.start)}`;
  return (
    <Pressable
      onPress={() => openLake(lake.id)}
      accessibilityRole="button"
      accessibilityHint="Opens the lake forecast"
      accessibilityLabel={`${lake.name}, ${seasonLabel(season).toLowerCase()}. ${detail}${next ? `, ${range}. ${live ? `${wait} left` : `Opens in ${wait}`}` : ''}.`}
      style={({ pressed }) => [styles.ticket, pressed && styles.pressed]}
    >
      <View style={styles.ticketMain}>
        <Row gap={5}>
          {season === 'ice' ? <Icon name="ice" size={12} color={onScene.accent} /> : null}
          <T variant="label" color={onScene.accent} numberOfLines={1} style={{ flexShrink: 1 }}>{lake.name}</T>
          <Icon name="chevron-right" size={12} color={onScene.accent} />
        </Row>
        <T variant="title" color={onScene.text} style={styles.when} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
          {next ? capitalize(range) : conditionLabel(fromNow(forecast.hours, now)[0].score)}
        </T>
        <T variant="caption" color={onScene.soft}>{detail}</T>
      </View>
      {next ? (
        <>
          <View style={styles.perforation}>
            {Array.from({ length: 9 }, (_, i) => <View key={i} style={styles.perforationDot} />)}
          </View>
          <View style={styles.ticketStub}>
            <Row gap={5}>
              {live ? <View style={styles.liveDot} /> : null}
              <T variant="label" color={onScene.accent}>{live ? 'Open' : 'Opens in'}</T>
            </Row>
            <T variant="title" color={onScene.text} style={styles.wait} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>{wait.replace(' min', 'm').replace(' h', 'h')}</T>
            {live ? <T variant="caption" color={onScene.soft}>left</T> : null}
          </View>
        </>
      ) : null}
    </Pressable>
  );
}

function OrbScore({ score, caption, top, palette }: { score: number; caption: string; top: number; palette: SkyPalette }) {
  const band = scoreBands[scoreBand(score)];
  const { ink } = palette.orb;
  return (
    <View style={[styles.orb, { top }]} accessible accessibilityRole="text" accessibilityLabel={`${caption} bite score ${score} out of 100, ${band.label}`}>
      <T variant="label" color={ink} maxFontSizeMultiplier={1.1} style={styles.orbCaption}>{caption}</T>
      <T variant="title" color={ink} maxFontSizeMultiplier={1.1} style={styles.orbScore}>{score}</T>
      <T variant="caption" weight="800" color={ink} maxFontSizeMultiplier={1.1}>{band.label}</T>
    </View>
  );
}

/** The next 24 hours along the shore, with the window lit on the waterline. */
function ShoreTimeline({ entry: { next }, now }: { entry: LakeData; now: number }) {
  const span = 24 * HOUR;
  const start = next ? (new Date(next.start).getTime() - now) / span : 1;
  const end = next ? (new Date(windowEnd(next)).getTime() - now) / span : 1;
  const from = Math.max(0, start);
  const to = Math.min(1, end);
  // Label the edge that matters: when an open window closes, or when the next one opens.
  const edge = start <= 0 ? to : from;
  return (
    <View style={styles.timeline} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <T variant="caption" weight="700" color={onScene.text} maxFontSizeMultiplier={1.15} style={styles.timelineNow}>Now</T>
      {next && start < 1 ? (
        <>
          <T variant="caption" weight="700" color={onScene.accent} maxFontSizeMultiplier={1.15} numberOfLines={1} style={[styles.timelineEdge, { left: `${Math.min(0.64, Math.max(0.24, edge)) * 100}%` }]}>
            {shortClock(start <= 0 ? windowEnd(next) : next.start)}
          </T>
          <View style={[styles.timelineWindow, { left: `${from * 100}%`, width: `${Math.max(0.02, to - from) * 100}%` }]} />
        </>
      ) : null}
      <T variant="caption" weight="700" color={onScene.text} maxFontSizeMultiplier={1.15} style={styles.timelineEnd}>Tomorrow</T>
    </View>
  );
}

/* ───────────── Water: why, how sure, what it’s like ───────────── */

function Conditions({ reason, confidence, span, units }: { reason: string; confidence: ForecastHour['confidence']; span: ForecastHour[]; units: AppSettings['units'] }) {
  const wind = avg(span, (hour) => hour.windKmh);
  const rain = sum(span, (hour) => hour.precipitationMm);
  const cloud = cloudLabel(avg(span, (hour) => hour.cloudPct));
  const pressure = pressureTrend(span);
  return (
    <View style={styles.conditions} accessible accessibilityLabel={`${reason}. ${confidence} confidence. Wind ${formatWind(wind, units)}, ${rainLabel(rain)}, ${cloud}, pressure ${pressure.toLowerCase()}.`}>
      <Row gap={spacing.sm} align="center">
        <T variant="title" color={onScene.text} numberOfLines={2} style={styles.reason}>{reason}</T>
        <ConfidenceBars level={confidence} tone="dark" />
      </Row>
      <View style={styles.tiles}>
        <Tile icon="wind" text={formatWind(wind, units)} warn={wind >= 25} />
        <Tile icon="rain" text={rainLabel(rain)} warn={rain >= 2} />
        <Tile icon="cloud" text={cloud} />
        <Tile icon="pressure" text={pressure} />
      </View>
    </View>
  );
}

function Tile({ icon, text, warn }: { icon: IconName; text: string; warn?: boolean }) {
  const color = warn ? onScene.accent : onScene.text;
  return (
    <View style={[styles.tile, warn && { borderColor: onScene.accent }]}>
      <Icon name={icon} size={17} color={color} />
      <T variant="caption" weight="700" color={color} align="center" numberOfLines={2} style={styles.tileText}>{text}</T>
    </View>
  );
}

const avg = (hours: ForecastHour[], pick: (h: ForecastHour) => number) => sum(hours, pick) / Math.max(1, hours.length);
const sum = (hours: ForecastHour[], pick: (h: ForecastHour) => number) => hours.reduce((total, h) => total + pick(h), 0);
const rainLabel = (mm: number) => (mm < 0.2 ? 'Dry' : `${Math.round(mm * 10) / 10} mm`);
const cloudLabel = (pct: number) => (pct < 25 ? 'Clear' : pct < 70 ? 'Part cloud' : 'Overcast');
const pressureTrend = (hours: ForecastHour[]) => {
  if (hours.length < 2) return 'Steady';
  const delta = hours[hours.length - 1].pressureHpa - hours[0].pressureHpa;
  return delta > 1 ? 'Rising' : delta < -1 ? 'Falling' : 'Steady';
};

/* ───────────── Wooden sign: other lakes and the full forecast ───────────── */

function Signpost({ best, others, now }: { best: LakeData; others: LakeData[]; now: number }) {
  return (
    <View style={styles.sign}>
      <WoodGrain />
      {others.map((entry) => <SignLake key={entry.lake.id} entry={entry} now={now} />)}
      <Pressable onPress={() => openLake(best.lake.id)} accessibilityRole="button" style={({ pressed }) => [styles.signRow, pressed && styles.pressed]}>
        <T variant="callout" weight="700" color={onScene.text} numberOfLines={1} style={{ flex: 1 }}>{`Full forecast · ${best.lake.name}`}</T>
        <Icon name="chevron-right" size={14} color={onScene.text} />
      </Pressable>
      {[styles.nailTopLeft, styles.nailTopRight, styles.nailBottomLeft, styles.nailBottomRight].map((position, i) => <View key={i} style={[styles.nail, position]} />)}
    </View>
  );
}

function SignLake({ entry, now }: { entry: LakeData; now: number }) {
  const { lake, next, live, season } = entry;
  const { score, reason, confidence, caption } = outlook(entry, now);
  const band = scoreBands[scoreBand(score)];
  const when = !next ? 'No window this week' : live ? `Open until ${shortClock(windowEnd(next))}` : `${dayLabel(next.start)} ${shortRange(next.start, windowEnd(next))}`;
  return (
    <Pressable
      onPress={() => openLake(lake.id)}
      accessibilityRole="button"
      accessibilityHint="Opens the lake forecast"
      accessibilityLabel={`Also ${lake.name}, ${seasonLabel(season).toLowerCase()}. ${when}. ${caption} bite score ${score}, ${band.label}. ${reason}. ${confidence} confidence.`}
      style={({ pressed }) => [styles.signRow, styles.signLake, pressed && styles.pressed]}
    >
      <View style={[styles.signScore, { borderColor: band.onDark }]}>
        <T variant="callout" weight="800" color={onScene.text} maxFontSizeMultiplier={1.2}>{score}</T>
        <T variant="caption" weight="700" color={onScene.text} maxFontSizeMultiplier={1.2} style={styles.signBand}>{band.label}</T>
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <T variant="callout" weight="700" color={onScene.text} numberOfLines={1}>{lake.name}</T>
        <T variant="caption" weight="700" color={onScene.accent} numberOfLines={1}>{when}</T>
        <Row gap={5}>
          <Icon name={reasonIcon(reason)} size={11} color={onScene.soft} />
          <T variant="caption" color={onScene.soft} numberOfLines={1} style={{ flex: 1 }}>{reason}</T>
          <ConfidenceBars level={confidence} tone="dark" bare />
        </Row>
      </View>
      <Icon name="chevron-right" size={14} color={onScene.text} />
    </Pressable>
  );
}

function WoodGrain() {
  const lines = Array.from({ length: 16 }, (_, i) => {
    const y = 3 + i * 6.2;
    const wobble = Math.sin(i * 2.1) * 3;
    return `M0 ${y} C80 ${y + wobble} 130 ${y - wobble} 190 ${y + wobble / 2} S270 ${y - wobble} 300 ${y}`;
  }).join(' ');
  return (
    <View style={styles.grain} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox="0 0 300 100" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="signWood" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={onScene.woodLight} />
            <Stop offset="1" stopColor={onScene.woodDark} />
          </LinearGradient>
        </Defs>
        <Rect width={300} height={100} fill="url(#signWood)" />
        <Path d={lines} stroke="#2E1C11" strokeWidth={0.6} opacity={0.5} fill="none" />
      </Svg>
    </View>
  );
}

const glass = { backgroundColor: onScene.glass, borderWidth: 1, borderColor: onScene.glassLine } as const;

const styles = StyleSheet.create({
  overscroll: { position: 'absolute', top: 0, left: 0, right: 0, height: '50%' },
  page: { flexGrow: 1 },
  content: { flexGrow: 1, paddingHorizontal: spacing.lg, width: '100%', maxWidth: 640, alignSelf: 'center' },
  pressed: { opacity: 0.75 },
  freshness: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, ...glass },
  info: { minWidth: 28, minHeight: 28, alignItems: 'center', justifyContent: 'center' },
  about: { marginTop: spacing.sm, padding: spacing.md, borderRadius: radius.md, ...glass },
  ticket: { flexDirection: 'row', marginTop: spacing.sm, borderRadius: radius.lg, ...glass },
  ticketMain: { flex: 1, gap: 2, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  when: { fontSize: 28, lineHeight: 34 },
  perforation: { justifyContent: 'space-evenly', paddingVertical: 4 },
  perforationDot: { width: 2, height: 4, borderRadius: 1, backgroundColor: onScene.glassLine },
  ticketStub: { width: 100, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm, gap: 2 },
  wait: { fontSize: 21, lineHeight: 26 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: onScene.accent },
  skySpace: { height: SKY_SPACE },
  orb: { position: 'absolute', alignSelf: 'center', width: ORB, height: ORB, alignItems: 'center', justifyContent: 'center' },
  orbCaption: { fontSize: 10, lineHeight: 12 },
  orbScore: { fontSize: 46, lineHeight: 50 },
  timeline: { position: 'absolute', left: 0, right: 0, bottom: 0, height: SHORE },
  timelineNow: { position: 'absolute', left: 0, top: 3 },
  timelineEdge: { position: 'absolute', top: 3, width: 72, marginLeft: -36, textAlign: 'center' },
  timelineEnd: { position: 'absolute', right: 0, top: 3 },
  timelineWindow: { position: 'absolute', bottom: 0, height: 3, borderRadius: 2, backgroundColor: onScene.accent },
  water: { marginTop: SURFACE + spacing.sm, gap: spacing.md },
  conditions: { gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, ...glass },
  reason: { flex: 1, fontSize: 16, lineHeight: 21, fontStyle: 'italic' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tile: { flexGrow: 1, flexBasis: 64, minHeight: 56, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 3, paddingVertical: 6, borderRadius: radius.sm, borderWidth: 1, borderColor: onScene.glassLine },
  tileText: { fontSize: 11.5, lineHeight: 14 },
  // Narrower than the page so the fishing line stays clear on the right.
  sign: { width: '88%', borderRadius: radius.xs, overflow: 'hidden', backgroundColor: onScene.woodDark },
  grain: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  signRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: touch.min, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  signLake: { borderBottomWidth: 1, borderBottomColor: '#35210F' },
  signScore: { minWidth: 46, height: 46, paddingHorizontal: 3, borderRadius: 23, borderWidth: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.25)' },
  signBand: { fontSize: 9, lineHeight: 11 },
  nail: { position: 'absolute', width: 5, height: 5, borderRadius: 3, backgroundColor: '#2A2A28', borderTopWidth: 1, borderTopColor: '#A59A8C' },
  nailTopLeft: { top: 6, left: 6 },
  nailTopRight: { top: 6, right: 6 },
  nailBottomLeft: { bottom: 6, left: 6 },
  nailBottomRight: { bottom: 6, right: 6 },
  floor: { flexGrow: 1, minHeight: LAKE_FLOOR },
  plainBlock: { gap: spacing.lg, padding: spacing.lg, borderRadius: radius.xl, backgroundColor: colors.paper },
});
