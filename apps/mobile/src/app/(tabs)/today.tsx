import { useState, type ReactNode } from 'react';
import { router } from 'expo-router';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import type { ForecastHour, ForecastWindow, LakeForecast, Season } from '@bitecast/engine';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import * as SunCalc from 'suncalc';
import { conditionLabel, upcomingWindows, windowEnd } from '@/components/forecast';
import { Icon } from '@/components/icon';
import { SkyArc } from '@/components/sky-arc';
import { Toast } from '@/components/toast';
import { Button, EmptyState, ErrorState, IceSafetyNotice, LinkButton, OfflineBanner, Reveal, Row, Screen, SkeletonCard, T } from '@/components/ui';
import { WalleyeArt } from '@/components/walleye';
import { colors, elevation, hitSlop, radius, scoreBand, scoreBands, spacing, touch } from '@/constants/theme';
import { forecastQuery, forecastSource, freshness } from '@/data/forecasts';
import { lakeById } from '@/data/lakes';
import { seasonLabel, useConditionResolver } from '@/features/lake-season';
import { formatDay, formatDuration, reasonIcon, shortClock, shortRange } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useNow } from '@/lib/use-now';
import { useAppStore } from '@/store/use-app-store';
import type { Lake } from '@/types/app';

const MAX_LAKES = 5;

type LakeData = { lake: Lake; season: Season; forecast: LakeForecast; updatedAt: number; next?: ForecastWindow; live: boolean };

/** “Today”, “Tomorrow”, else a short weekday (“Mon”) — compact enough for pills and rows. */
const shortDay = (value: string) => {
  const day = formatDay(value);
  return day === 'Today' || day === 'Tomorrow' ? day : new Date(value).toLocaleDateString([], { weekday: 'short' });
};

/** The window to act on for a lake: one open now, else the soonest upcoming. */
function actionable(windows: ForecastWindow[], now: number) {
  const upcoming = upcomingWindows(windows, now);
  const open = upcoming.find((w) => new Date(w.start).getTime() <= now);
  return { next: open ?? upcoming[0], live: Boolean(open) };
}

export default function TodayScreen() {
  const ids = useAppStore((state) => state.followedLakeIds);
  const resolve = useConditionResolver();
  const seasons = ids.map((id) => resolve(id).season);
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [hourIndex, setHourIndex] = useState(0);
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
  const focus = data.find((entry) => entry.lake.id === focusId) ?? data[0];
  const others = data.filter((entry) => entry.lake.id !== focus?.lake.id);

  const chooseLake = (id: string) => {
    if (id === focus?.lake.id) return;
    haptic.select();
    setFocusId(id);
    setHourIndex(0);
  };

  const focusHour = focus?.forecast.hours[Math.min(hourIndex, focus.forecast.hours.length - 1)];
  const [aboutOpen, setAboutOpen] = useState(false);
  const broad = focus?.forecast.predictionGranularity === 'time_block';

  return (
    <View style={{ flex: 1 }}>
      <Screen tab header refreshing={refreshing} onRefresh={refresh}>
        <Scene night={focus && focusHour ? SunCalc.getPosition(new Date(focusHour.ts), focus.lake.latitude, focus.lake.longitude).altitude <= 0 : false} hasLake={Boolean(focus)}>
          <Header now={now} fresh={fresh} refreshing={refreshing} onRefresh={refresh} />
          {focus && focusHour ? (
            <>
              <LakeLine entry={focus} isTop={focus.lake.id === data[0]?.lake.id} />
              <Readout entry={focus} hour={focusHour} index={hourIndex} onReset={() => setHourIndex(0)} />
              <WindowPills entry={focus} hour={focusHour} now={now} />
              <SkyArc
                immersive
                tagScore
                fishCount={6}
                fishScale={1.25}
                hours={focus.forecast.hours}
                windows={focus.forecast.windows}
                ice={focus.season === 'ice'}
                index={hourIndex}
                onIndexChange={setHourIndex}
                latitude={focus.lake.latitude}
                longitude={focus.lake.longitude}
              />
            </>
          ) : null}
        </Scene>

        {focus ? (
          <>
            <Reveal index={0} style={styles.rows}>
              {others.map((entry) => (
                <LakeRow key={entry.lake.id} entry={entry} now={now} onPress={() => chooseLake(entry.lake.id)} />
              ))}
              {ids.length < MAX_LAKES ? (
                <Pressable
                  onPress={() => router.push('/(tabs)/map')}
                  accessibilityRole="button"
                  accessibilityLabel={`Follow another lake. ${ids.length} of ${MAX_LAKES} followed.`}
                  style={({ pressed }) => [styles.addRow, pressed && { opacity: 0.6 }]}
                >
                  <Icon name="plus" size={16} color={colors.teal} />
                  <T variant="callout" weight="700" color={colors.teal} style={{ flex: 1 }}>Follow another lake</T>
                  <T variant="caption" color={colors.inkMuted}>{ids.length} of {MAX_LAKES}</T>
                </Pressable>
              ) : null}
            </Reveal>
            {focus.season === 'ice' || seasons.includes('ice') ? <IceSafetyNotice compact /> : null}
            <OfflineBanner />
          </>
        ) : (
          <>
            <OfflineBanner />
            {ids.length === 0 ? (
              <EmptyState
                icon="lake"
                art={<WalleyeArt width={200} tone="light" />}
                title="No lakes followed yet"
                body="Follow up to five lakes to see their day of light and best windows here."
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

        {focus ? (
          <Reveal index={1} style={{ gap: spacing.md }}>
            <WeekStrip key={focus.lake.id} entry={focus} />
            <LogPrompt lakeId={focus.lake.id} />
          </Reveal>
        ) : null}

        <View style={{ gap: spacing.xs, alignItems: 'center' }}>
          <Row gap={6} justify="center">
            <T variant="caption" color={colors.inkMuted}>Conditions, not a guarantee of fish{data[0] ? ` · ${forecastSource(data[0].forecast)}` : ''}</T>
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

/* ───────────── Scene: one sky that holds the header, readout and lake ───────────── */

const sky = {
  day: { top: '#D3E5E2', horizon: '#EEF1EA' },
  night: { top: '#BCC9D0', horizon: '#E4E9E6' },
};

function Scene({ night, hasLake, children }: { night: boolean; hasLake: boolean; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const tone = night ? sky.night : sky.day;
  return (
    <View style={[styles.scene, { paddingTop: insets.top + spacing.sm }]}>
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <LinearGradient id="pageSky" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={tone.top} />
            <Stop offset={hasLake ? '0.55' : '0.8'} stopColor={tone.horizon} />
            <Stop offset="1" stopColor={hasLake ? tone.horizon : colors.cream} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#pageSky)" />
      </Svg>
      {children}
    </View>
  );
}

function Header({ now, fresh, refreshing, onRefresh }: { now: number; fresh: { state: 'fresh' | 'aging' | 'stale'; label: string }; refreshing: boolean; onRefresh: () => void }) {
  const stale = fresh.state === 'stale';
  const date = new Date(now).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  const updated = refreshing ? 'refreshing…' : fresh.label.replace(/^Updated /, 'updated ').replace(/^Forecast is /, '');
  return (
    <Row justify="space-between" align="center" style={styles.pad}>
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

function LakeLine({ entry, isTop }: { entry: LakeData; isTop: boolean }) {
  const { lake, season } = entry;
  return (
    <Row gap={spacing.sm} style={[styles.pad, { marginTop: spacing.md }]}>
      <Icon name={season === 'ice' ? 'ice' : 'open-water'} size={16} color={colors.teal} />
      <T variant="headline" numberOfLines={1} style={{ flexShrink: 1 }}>{lake.name}</T>
      {isTop ? <View style={styles.topTag}><T variant="label" color={colors.sunriseInk} style={{ fontSize: 9 }}>Top pick</T></View> : null}
      <View style={{ flex: 1 }} />
      <LinkButton icon="chevron-right" onPress={() => router.push({ pathname: '/lake/[id]', params: { id: lake.id } })}>Forecast</LinkButton>
    </Row>
  );
}

/** Score → (time, reason, confidence) for the scrubbed hour. */
function Readout({ entry, hour, index, onReset }: { entry: LakeData; hour: ForecastHour; index: number; onReset: () => void }) {
  const band = scoreBands[scoreBand(hour.score)];
  const timeLabel = index === 0 ? 'Now' : `${shortDay(hour.ts)} · ${shortClock(hour.ts)}`;
  const reason = hour.reasons[0] ?? 'Mixed conditions';
  return (
    <Row gap={spacing.lg} align="center" style={[styles.pad, { marginTop: spacing.xs, marginBottom: spacing.sm }]} accessibilityLiveRegion="polite">
      <View accessible accessibilityLabel={`Bite score ${hour.score} out of 100, ${band.label}`} style={{ minWidth: 64 }}>
        <T variant="numeralL" style={{ lineHeight: 36 }}>{hour.score}</T>
        <T variant="caption" weight="800" color={band.color}>{band.label}</T>
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <T variant="label" color={colors.inkMuted} numberOfLines={1}>{timeLabel}</T>
        <Row gap={spacing.sm} accessible accessibilityLabel={`${reason}. ${hour.confidence} confidence.`}>
          <T variant="callout" color={colors.ink} numberOfLines={2} style={{ flexShrink: 1 }}>{reason}</T>
          <Bars level={hour.confidence} />
        </Row>
      </View>
      {index !== 0 ? (
        <Pressable onPress={onReset} hitSlop={hitSlop} accessibilityRole="button" accessibilityLabel="Back to now" style={({ pressed }) => [styles.nowPill, pressed && { opacity: 0.6 }]}>
          <Icon name="restore" size={13} color={colors.teal} />
          <T variant="caption" weight="700" color={colors.teal}>Now</T>
        </Pressable>
      ) : null}
    </Row>
  );
}

/** Window context for the scrubbed hour: the window you're in (left) and the next one (right). */
function WindowPills({ entry, hour, now }: { entry: LakeData; hour: ForecastHour; now: number }) {
  const { forecast } = entry;
  const broad = forecast.predictionGranularity === 'time_block';
  const hourMs = new Date(hour.ts).getTime();
  const containing = forecast.windows.find((w) => w.hours.some((h) => h.ts === hour.ts));
  const next = upcomingWindows(forecast.windows, Math.max(now, hourMs)).find((w) => new Date(w.start).getTime() > hourMs);
  if (!containing && !next) return null;
  const nextDay = next ? shortDay(next.start) : '';
  return (
    <Row gap={spacing.sm} style={[styles.pad, { marginBottom: spacing.xs }]}>
      {containing ? (
        <View style={styles.pillLight} accessible accessibilityLabel={`In a ${broad ? 'broad block' : 'bite window'}, ends ${shortClock(windowEnd(containing))}`}>
          <View style={styles.swatch} />
          <T variant="caption" weight="700" color={colors.sunriseInk} numberOfLines={1}>{broad ? 'In block' : 'Bite window'} · ends {shortClock(windowEnd(containing))}</T>
        </View>
      ) : null}
      <View style={{ flex: 1 }} />
      {next ? (
        <View style={styles.pillDark} accessible accessibilityLabel={`Next ${broad ? 'block' : 'window'} ${formatDay(next.start)} ${shortRange(next.start, windowEnd(next))}${broad ? '' : `, peak ${next.peakScore}`}, ${next.confidence} confidence`}>
          <T variant="caption" weight="700" color={colors.onDark} numberOfLines={1}>
            Next · {nextDay === 'Today' ? '' : `${nextDay} `}{shortRange(next.start, windowEnd(next))}{broad ? '' : ` · ${next.peakScore}`}
          </T>
        </View>
      ) : null}
    </Row>
  );
}

/* ───────────── Other lakes: slim rows; tap to put one in the sky ───────────── */

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

function LakeRow({ entry, now, onPress }: { entry: LakeData; now: number; onPress: () => void }) {
  const { lake, next, live, forecast, season } = entry;
  const current = forecast.hours[0];
  const score = next?.peakScore ?? current.score;
  const band = scoreBands[scoreBand(score)];
  const when = next
    ? live
      ? 'On now'
      : `Opens ${shortDay(next.start) === 'Today' ? '' : `${shortDay(next.start)} `}${shortClock(next.start)}`
    : 'No window this week';
  const reason = (next?.reasons ?? current.reasons)[0] ?? 'Mixed conditions';
  const confidence = next?.confidence ?? current.confidence;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${lake.name}, ${seasonLabel(season).toLowerCase()}. ${when}. ${next ? 'Peak' : 'Now'} bite score ${score}, ${conditionLabel(score)}. ${reason}. ${confidence} confidence.`}
      accessibilityHint="Shows this lake in the sky"
      style={({ pressed }) => [styles.lakeRow, pressed && { opacity: 0.75 }]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Row gap={6}>
          <Icon name={season === 'ice' ? 'ice' : 'open-water'} size={13} color={colors.teal} />
          <T variant="subhead" numberOfLines={1} style={{ flexShrink: 1 }}>{lake.name}</T>
        </Row>
        <T variant="callout" color={live ? colors.sunriseInk : colors.inkSoft} weight={live ? '700' : '400'} numberOfLines={1}>
          {when}{live && next ? ` · ${formatDuration(new Date(windowEnd(next)).getTime() - now)} left` : ''}
        </T>
        <Row gap={spacing.sm}>
          <Icon name={reasonIcon(reason)} size={13} color={colors.teal} />
          <T variant="caption" color={colors.inkMuted} numberOfLines={1} style={{ flex: 1 }}>{reason}</T>
          <Bars level={confidence} />
        </Row>
      </View>
      <View style={[styles.scorePill, { backgroundColor: band.tint }]}>
        <T variant="numeralM" color={colors.ink}>{score}</T>
      </View>
    </Pressable>
  );
}

/* ───────────── This week: best hour per day for the lake in the sky ───────────── */

function WeekStrip({ entry }: { entry: LakeData }) {
  const { lake, forecast } = entry;
  const days = (() => {
    const groups = new Map<string, ForecastHour[]>();
    forecast.hours.forEach((hour) => {
      const d = new Date(hour.ts);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      groups.set(key, [...(groups.get(key) ?? []), hour]);
    });
    return [...groups.values()].slice(0, 7).map((hours) => [...hours].sort((a, b) => b.score - a.score)[0]);
  })();
  const bestIndex = days.reduce((best, day, i) => (day.score > days[best].score ? i : best), 0);
  const [selected, setSelected] = useState<number | null>(null);
  const pick = days[selected ?? bestIndex];
  if (!pick) return null;
  const pickBand = scoreBands[scoreBand(pick.score)];

  return (
    <View style={styles.week}>
      <Row justify="space-between" align="center">
        <T variant="subhead">This week · {lake.name}</T>
        <LinkButton icon="chevron-right" onPress={() => router.push({ pathname: '/lake/[id]', params: { id: lake.id } })}>7 days</LinkButton>
      </Row>
      <Row gap={6} align="flex-end" accessibilityRole="tablist">
        {days.map((day, i) => {
          const band = scoreBands[scoreBand(day.score)];
          const active = i === (selected ?? bestIndex);
          return (
            <Pressable
              key={day.ts}
              onPress={() => { haptic.select(); setSelected(i); }}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${formatDay(day.ts)}, best near ${shortClock(day.ts)}, bite score ${day.score}, ${band.label}. ${day.reasons[0] ?? ''}. ${day.confidence} confidence.`}
              style={[styles.dayCol, active && styles.dayColActive]}
            >
              <T variant="caption" weight="700" color={active ? colors.ink : colors.inkMuted} style={{ fontSize: 11 }} maxFontSizeMultiplier={1.2}>{day.score}</T>
              <View style={styles.dayTrack}>
                <View style={[styles.dayBar, { height: `${Math.max(8, day.score)}%`, backgroundColor: band.color, opacity: active ? 1 : 0.55 }]} />
              </View>
              <T variant="caption" weight={i === bestIndex ? '800' : '600'} color={active ? colors.ink : colors.inkMuted} style={{ fontSize: 11 }} maxFontSizeMultiplier={1.2}>
                {i === 0 ? 'Today' : new Date(day.ts).toLocaleDateString([], { weekday: 'short' })}
              </T>
            </Pressable>
          );
        })}
      </Row>
      <Row gap={spacing.sm} style={styles.weekDetail} accessibilityLiveRegion="polite">
        <Icon name={reasonIcon(pick.reasons[0] ?? '')} size={14} color={colors.teal} />
        <T variant="caption" color={colors.inkSoft} numberOfLines={1} style={{ flex: 1 }}>
          <T variant="caption" weight="700" color={colors.ink}>{shortDay(pick.ts)} · best {shortClock(pick.ts)} · </T>
          <T variant="caption" weight="700" color={pickBand.color}>{pick.score} {pickBand.label}</T>
          {` · ${pick.reasons[0] ?? 'Mixed conditions'}`}
        </T>
        <Bars level={pick.confidence} />
      </Row>
    </View>
  );
}

/* ───────────── Quick log: the free core action ───────────── */

function LogPrompt({ lakeId }: { lakeId: string }) {
  const last = useAppStore((state) => state.catchLogs[0]);
  const lastLine = last ? `Last trip · ${lakeById(last.lakeId).name}, ${formatDay(last.caughtAt).toLowerCase()}` : 'No-catch trips count too';
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/log/new', params: { lakeId } })}
      accessibilityRole="button"
      accessibilityLabel={`Log a trip. ${lastLine}`}
      style={({ pressed }) => [styles.logRow, pressed && { opacity: 0.8 }]}
    >
      <View style={styles.logIcon}><Icon name="plus" size={18} color={colors.onDark} /></View>
      <View style={{ flex: 1, gap: 1 }}>
        <T variant="subhead">Log a trip</T>
        <T variant="caption" color={colors.inkMuted} numberOfLines={1}>{lastLine}</T>
      </View>
      <Icon name="chevron-right" size={16} color={colors.inkFaint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scene: { marginHorizontal: -spacing.xl, marginTop: -spacing.lg, overflow: 'hidden' },
  pad: { paddingHorizontal: spacing.xl },
  freshness: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1, marginLeft: spacing.md },
  topTag: { backgroundColor: colors.sunriseTint, paddingHorizontal: 7, paddingVertical: 3, borderRadius: radius.sm },
  nowPill: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 36, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.tealMist },
  pillLight: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.88)' },
  pillDark: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.deep },
  swatch: { width: 14, height: 4, borderRadius: 2, backgroundColor: colors.sunrise },
  lakeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.white, ...elevation.low },
  scorePill: { minWidth: 56, minHeight: 44, paddingHorizontal: spacing.md, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  week: { gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.white, ...elevation.low },
  dayCol: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 6, borderRadius: radius.sm, minHeight: touch.min },
  dayColActive: { backgroundColor: colors.tealMist },
  dayTrack: { width: 12, height: 48, justifyContent: 'flex-end', borderRadius: 4, backgroundColor: colors.fog, overflow: 'hidden' },
  dayBar: { width: '100%', borderRadius: 4 },
  weekDetail: { paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: colors.line },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, paddingRight: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.tealMist, borderWidth: 1, borderColor: colors.tealTint },
  logIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.deep, alignItems: 'center', justifyContent: 'center' },
  rows: { gap: spacing.sm, marginTop: -spacing.xxxl },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  bar: { width: 3, borderRadius: 1 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: touch.comfortable, paddingHorizontal: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.lineStrong },
});
