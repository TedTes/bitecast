import { useState, type ReactNode } from 'react';
import { router } from 'expo-router';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import type { ForecastHour, ForecastWindow, LakeForecast, Season } from '@bitecast/engine';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import * as SunCalc from 'suncalc';
import { conditionLabel, upcomingWindows, windowEnd } from '@/components/forecast';
import { Icon, type IconName } from '@/components/icon';
import { LakeSchool } from '@/components/lake-school';
import { Toast } from '@/components/toast';
import { Button, Divider, EmptyState, ErrorState, IceSafetyNotice, LinkButton, OfflineBanner, Reveal, Row, Screen, SkeletonCard, T } from '@/components/ui';
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
 * The sky and lake are a calm backdrop only; hour-by-hour detail lives on the lake screen.
 */

const MAX_LAKES = 5;

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

/** “Today 7–10 am”, “Tomorrow noon–6 pm”, “Mon 5–9 am”. */
const whenLabel = (window: ForecastWindow) => {
  const day = formatDay(window.start);
  const short = day === 'Today' || day === 'Tomorrow' ? day : new Date(window.start).toLocaleDateString([], { weekday: 'short' });
  return `${short} ${shortRange(window.start, windowEnd(window))}`;
};

export default function TodayScreen() {
  const ids = useAppStore((state) => state.followedLakeIds);
  const units = useAppStore((state) => state.settings.units);
  const resolve = useConditionResolver();
  const seasons = ids.map((id) => resolve(id).season);
  const queryClient = useQueryClient();
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
      <Screen tab header refreshing={refreshing} onRefresh={refresh}>
        <Backdrop night={night} score={nowHour?.score ?? 50} ice={best?.season === 'ice'} hasAnswer={Boolean(best)}>
          <Header now={now} fresh={fresh} refreshing={refreshing} onRefresh={refresh} />
        </Backdrop>

        {best ? (
          <>
            <Reveal index={0} style={styles.float}>
              <AnswerCard entry={best} now={now} units={units} />
            </Reveal>
            {seasons.includes('ice') ? <IceSafetyNotice compact /> : null}
            <OfflineBanner />

            <Reveal index={1} style={{ gap: spacing.sm }}>
              <Row justify="space-between" align="center">
                <T variant="label" color={colors.inkMuted} accessibilityRole="header">{others.length ? 'Your other lakes' : 'Compare lakes'}</T>
                {ids.length < MAX_LAKES ? <LinkButton icon="plus" onPress={() => router.push('/(tabs)/map')}>{`Follow · ${ids.length}/${MAX_LAKES}`}</LinkButton> : null}
              </Row>
              {others.length ? (
                <View style={styles.group}>
                  {others.map((entry, i) => (
                    <View key={entry.lake.id}>
                      {i > 0 ? <Divider /> : null}
                      <LakeRow entry={entry} now={now} />
                    </View>
                  ))}
                </View>
              ) : (
                <T variant="caption" color={colors.inkMuted}>Follow another lake to compare windows.</T>
              )}
            </Reveal>

            <Reveal index={2}>
              <LogAction lakeId={best.lake.id} />
            </Reveal>
          </>
        ) : (
          <>
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
          </>
        )}

        <View style={{ gap: spacing.xs, alignItems: 'center' }}>
          <Row gap={6} justify="center">
            <T variant="caption" color={colors.inkMuted}>Conditions, not a guarantee of fish{best ? ` · ${forecastSource(best.forecast)}` : ''}</T>
            {broad ? (
              <Pressable onPress={() => setAboutOpen((open) => !open)} hitSlop={hitSlop} accessibilityRole="button" accessibilityState={{ expanded: aboutOpen }} accessibilityLabel="About broad time blocks">
                <Icon name="info" size={14} color={colors.teal} />
              </Pressable>
            ) : null}
          </Row>
          {broad && aboutOpen ? (
            <T variant="caption" color={colors.inkMuted} align="center" style={{ paddingHorizontal: spacing.lg }}>
              This lake uses broad time-block outlooks. They repeat across the day and don’t identify an exact peak hour.
            </T>
          ) : null}
        </View>
      </Screen>
      <Toast trigger={refreshErrorAt} icon="sync-error" message="Couldn’t refresh. Showing the forecast saved on this device." actionLabel="Retry" onAction={refresh} />
    </View>
  );
}

/* ───────────── Backdrop: sky behind the header, a calm lake below (decorative) ───────────── */

const LAKE_H = 96;
const OVERLAP = 56;

function Backdrop({ night, score, ice, hasAnswer, children }: { night: boolean; score: number; ice: boolean; hasAnswer: boolean; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [width, setWidth] = useState(0);
  const sky = night ? { top: '#BCC9D0', bottom: '#E4E9E6' } : { top: '#D3E5E2', bottom: '#EEF1EA' };
  return (
    <View style={[styles.backdrop, { paddingTop: insets.top + spacing.sm }]} onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}>
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={sky.top} />
            <Stop offset="1" stopColor={sky.bottom} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#sky)" />
      </Svg>
      {children}
      {hasAnswer && width ? (
        <View style={{ height: LAKE_H }} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Svg width={width} height={LAKE_H} style={StyleSheet.absoluteFill}>
            <Defs>
              <LinearGradient id="water" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={ice ? '#E6EEF0' : colors.chartWater} />
                <Stop offset="0.55" stopColor={ice ? '#D3DFE2' : colors.chartWaterDeep} />
                <Stop offset="1" stopColor={colors.cream} />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width={width} height={LAKE_H} fill="url(#water)" />
            <Path d={`M0 0 L${width} 0`} stroke={colors.teal} strokeWidth={1} opacity={0.4} />
            {ice ? <Rect x={0} y={0} width={width} height={6} fill={colors.white} opacity={0.85} /> : null}
          </Svg>
          <LakeSchool width={width} top={ice ? 10 : 6} bottom={LAKE_H - OVERLAP - 4} mood={score >= 60 ? 'active' : score >= 40 ? 'idle' : 'sleepy'} count={5} sizeScale={1.1} />
        </View>
      ) : null}
    </View>
  );
}

function Header({ now, fresh, refreshing, onRefresh }: { now: number; fresh: { state: 'fresh' | 'aging' | 'stale'; label: string }; refreshing: boolean; onRefresh: () => void }) {
  const stale = fresh.state === 'stale';
  const date = new Date(now).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  const updated = refreshing ? 'refreshing…' : fresh.label.replace(/^Updated /, 'updated ').replace(/^Forecast is /, '');
  return (
    <Row justify="space-between" align="center" style={styles.headerRow}>
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
  const kind = broad ? 'block' : 'window';
  const status = next
    ? live
      ? `${broad ? 'Block' : 'Window'} open · ${formatDuration(new Date(windowEnd(next)).getTime() - now)} left`
      : `Next ${kind} · in ${formatDuration(new Date(next.start).getTime() - now)}`
    : 'No window this week';
  // Conditions over the window (or right now when there is none).
  const span = next ? next.hours : [current];
  const wind = avg(span, (h) => h.windKmh);
  const rain = sum(span, (h) => h.precipitationMm);

  return (
    <View
      style={[styles.card, live && styles.cardLive]}
      accessible
      accessibilityLabel={`${status}. ${lake.name}, ${seasonLabel(season).toLowerCase()}. ${next ? whenLabel(next) : 'Now'}. ${next ? 'Peak' : 'Now'} bite score ${score}, ${band.label}. ${reason}. ${confidence} confidence. Wind ${formatWind(wind, units)}, ${rainLabel(rain)}, cloud ${Math.round(avg(span, (h) => h.cloudPct))} percent, pressure ${pressureTrend(span).toLowerCase()}.`}
    >
      <Row gap={spacing.sm}>
        {live ? <View style={styles.liveDot} /> : <Icon name="clock" size={13} color={colors.inkMuted} />}
        <T variant="label" color={live ? colors.sunriseInk : colors.inkMuted} numberOfLines={1} style={{ flex: 1 }}>{status}</T>
      </Row>

      <Row gap={spacing.lg} align="center">
        <View style={{ flex: 1, gap: 2 }}>
          <Row gap={6}>
            <Icon name={season === 'ice' ? 'ice' : 'open-water'} size={14} color={colors.teal} />
            <T variant="subhead" color={colors.inkSoft} numberOfLines={1} style={{ flexShrink: 1 }}>{lake.name}</T>
          </Row>
          <T variant="title" style={{ fontSize: 26, lineHeight: 31 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
            {next ? whenLabel(next) : `Now · ${conditionLabel(current.score)}`}
          </T>
        </View>
        <View style={[styles.tile, { backgroundColor: band.tint, borderColor: band.color }]}>
          <T variant="label" color={band.color} style={{ fontSize: 9 }}>{next ? 'Peak' : 'Now'}</T>
          <T variant="numeralL">{score}</T>
          <T variant="caption" weight="800" color={band.color}>{band.label}</T>
        </View>
      </Row>

      <Row gap={spacing.sm}>
        <Icon name={reasonIcon(reason)} size={14} color={colors.teal} />
        <T variant="callout" style={{ flex: 1 }} numberOfLines={2}>{reason}</T>
        <Bars level={confidence} />
      </Row>

      <View style={styles.conditions}>
        <Condition icon="wind" label="Wind" value={formatWind(wind, units)} warn={wind >= 25} />
        <Condition icon="rain" label="Rain" value={rainLabel(rain)} warn={rain >= 2} />
        <Condition icon="cloud" label="Cloud" value={`${Math.round(avg(span, (h) => h.cloudPct))}%`} />
        <Condition icon="pressure" label="Pressure" value={pressureTrend(span)} />
      </View>

      <Row justify="space-between" align="center">
        <T variant="caption" color={colors.inkMuted}>{next ? `Conditions during the ${kind}` : 'Conditions right now'}</T>
        <LinkButton icon="chevron-right" onPress={() => router.push({ pathname: '/lake/[id]', params: { id: lake.id } })}>Hour by hour</LinkButton>
      </Row>
    </View>
  );
}

const avg = (hours: ForecastHour[], pick: (h: ForecastHour) => number) => hours.reduce((total, h) => total + pick(h), 0) / Math.max(1, hours.length);
const sum = (hours: ForecastHour[], pick: (h: ForecastHour) => number) => hours.reduce((total, h) => total + pick(h), 0);
const rainLabel = (mm: number) => (mm < 0.2 ? 'Dry' : `${Math.round(mm * 10) / 10} mm`);
const pressureTrend = (hours: ForecastHour[]) => {
  if (hours.length < 2) return 'Steady';
  const delta = hours[hours.length - 1].pressureHpa - hours[0].pressureHpa;
  return delta > 1 ? 'Rising' : delta < -1 ? 'Falling' : 'Steady';
};

function Condition({ icon, label, value, warn }: { icon: IconName; label: string; value: string; warn?: boolean }) {
  return (
    <View style={styles.condition}>
      <Icon name={icon} size={16} color={warn ? colors.warning : colors.teal} />
      <T variant="numeralS" color={warn ? colors.warning : colors.ink} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ fontSize: 14 }}>{value}</T>
      <T variant="caption" color={colors.inkMuted} style={{ fontSize: 11 }}>{label}</T>
    </View>
  );
}

const barLevel = { High: 3, Medium: 2, Low: 1 } as const;
/** Compact confidence: three bars + level word. */
function Bars({ level }: { level: 'High' | 'Medium' | 'Low' }) {
  return (
    <Row gap={4} importantForAccessibility="no-hide-descendants">
      <View style={styles.bars}>
        {[1, 2, 3].map((bar) => <View key={bar} style={[styles.bar, { height: 3 + bar * 3, backgroundColor: bar <= barLevel[level] ? colors.teal : colors.fogDeep }]} />)}
      </View>
      <T variant="caption" color={colors.inkMuted}>{level}</T>
    </Row>
  );
}

/* ───────────── Other lakes: one line each, ranked ───────────── */

function LakeRow({ entry, now }: { entry: LakeData; now: number }) {
  const { lake, next, live, forecast, season } = entry;
  const current = fromNow(forecast.hours, now)[0];
  const score = next?.peakScore ?? current.score;
  const band = scoreBands[scoreBand(score)];
  const when = next ? (live ? `Open now · ends ${shortClock(windowEnd(next))}` : whenLabel(next)) : 'No window this week';
  const reason = (next?.reasons ?? current.reasons)[0] ?? 'Mixed conditions';
  const confidence = next?.confidence ?? current.confidence;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/lake/[id]', params: { id: lake.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${lake.name}, ${seasonLabel(season).toLowerCase()}. ${when}. ${next ? 'Peak' : 'Now'} bite score ${score}, ${band.label}. ${reason}. ${confidence} confidence.`}
      accessibilityHint="Opens the lake forecast"
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Row gap={6}>
          <T variant="subhead" numberOfLines={1} style={{ flexShrink: 1 }}>{lake.name}</T>
          <T variant="caption" weight="700" color={live ? colors.sunriseInk : colors.inkSoft} numberOfLines={1} style={{ flexShrink: 1 }}>· {when}</T>
        </Row>
        <Row gap={spacing.sm}>
          <Icon name={reasonIcon(reason)} size={12} color={colors.teal} />
          <T variant="caption" color={colors.inkMuted} numberOfLines={1} style={{ flex: 1 }}>{reason}</T>
          <Bars level={confidence} />
        </Row>
      </View>
      <View style={[styles.pill, { backgroundColor: band.tint }]}>
        <T variant="numeralS" color={colors.ink}>{score}</T>
      </View>
    </Pressable>
  );
}

function LogAction({ lakeId }: { lakeId: string }) {
  const last = useAppStore((state) => state.catchLogs[0]);
  return (
    <View style={{ gap: spacing.xs }}>
      <Button variant="secondary" size="md" icon="plus" onPress={() => router.push({ pathname: '/log/new', params: { lakeId } })}>Log a trip</Button>
      <T variant="caption" color={colors.inkMuted} align="center">
        {last ? `Last trip · ${lakeById(last.lakeId).name}, ${formatDay(last.caughtAt)}` : 'No-catch trips count too'}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { marginHorizontal: -spacing.xl, marginTop: -spacing.lg, overflow: 'hidden' },
  headerRow: { paddingHorizontal: spacing.xl, paddingBottom: spacing.lg },
  freshness: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1, marginLeft: spacing.md },
  float: { marginTop: -OVERLAP },
  card: { gap: spacing.md, padding: spacing.lg, borderRadius: radius.xl, backgroundColor: colors.white, ...elevation.raised },
  cardLive: { borderWidth: 1.5, borderColor: colors.sunrise },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.sunrise },
  tile: { width: 80, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1 },
  conditions: { flexDirection: 'row', paddingVertical: spacing.sm, borderRadius: radius.md, backgroundColor: colors.tealMist },
  condition: { flex: 1, alignItems: 'center', gap: 2 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  bar: { width: 3, borderRadius: 1 },
  group: { paddingHorizontal: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.white, ...elevation.low },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  pill: { minWidth: 44, minHeight: 36, paddingHorizontal: spacing.sm, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
});
