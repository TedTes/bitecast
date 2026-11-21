import { useState, type ReactNode } from 'react';
import { router } from 'expo-router';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import type { ForecastWindow, LakeForecast, Season } from '@bitecast/engine';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { ConfidenceMeter, DayStrip, ForecastFootnote, ReasonLine, ScoreReadout, conditionLabel, upcomingWindows, windowEnd } from '@/components/forecast';
import { Icon } from '@/components/icon';
import { SkyArc } from '@/components/sky-arc';
import { Toast } from '@/components/toast';
import { Button, Card, Divider, EmptyState, ErrorState, IceSafetyNotice, LinkButton, OfflineBanner, Reveal, Row, Screen, SkeletonCard, T } from '@/components/ui';
import { WalleyeArt } from '@/components/walleye';
import { colors, elevation, hitSlop, radius, scoreBand, scoreBands, spacing, touch } from '@/constants/theme';
import { forecastQuery, forecastSource, freshness } from '@/data/forecasts';
import { lakeById } from '@/data/lakes';
import { seasonLabel, useConditionResolver } from '@/features/lake-season';
import { formatDay, formatDuration, shortClock, shortRange } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useNow } from '@/lib/use-now';
import { useAppStore } from '@/store/use-app-store';
import type { Lake } from '@/types/app';

const MAX_LAKES = 5;
/** How far the readout card floats up over the lake's fade. */
const FLOAT_OVERLAP = 44;

type LakeData = { lake: Lake; season: Season; forecast: LakeForecast; updatedAt: number; next?: ForecastWindow; live: boolean };

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

  const chooseLake = (id: string) => {
    if (id === focus?.lake.id) return;
    haptic.select();
    setFocusId(id);
    setHourIndex(0);
  };

  const focusHour = focus?.forecast.hours[Math.min(hourIndex, focus.forecast.hours.length - 1)];

  return (
    <View style={{ flex: 1 }}>
    <Screen tab header refreshing={refreshing} onRefresh={refresh}>
      <Hero
        now={now}
        source={data[0] ? forecastSource(data[0].forecast) : 'No forecast'}
        fresh={fresh}
        refreshing={refreshing}
        onRefresh={refresh}
        night={focusHour ? focusHour.sunElevation <= 0 : false}
      >
        {focus ? (
          <SkyArc immersive hours={focus.forecast.hours} windows={focus.forecast.windows} ice={focus.season === 'ice'} index={hourIndex} onIndexChange={setHourIndex} />
        ) : null}
      </Hero>

      {!focus ? <OfflineBanner /> : null}
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
      ) : loading && !focus ? (
        <>
          <SkeletonCard lines={5} />
          <SkeletonCard lines={3} />
        </>
      ) : focus ? (
        <>
          <Reveal index={0} style={styles.float}>
            <ReadoutCard entry={focus} isTop={focus.lake.id === data[0]?.lake.id} index={hourIndex} onIndexChange={setHourIndex} now={now} />
          </Reveal>
          {/* Notices sit below the floating card so its overlap never covers them. */}
          {seasons.includes('ice') ? <IceSafetyNotice compact /> : null}
          <OfflineBanner />
          <Reveal index={1}>
            <LakeList entries={data} focusId={focus.lake.id} onFocus={chooseLake} now={now} canAdd={ids.length < MAX_LAKES} count={ids.length} />
          </Reveal>
        </>
      ) : null}

      <ForecastFootnote predictionGranularity={focus?.forecast.predictionGranularity} />
    </Screen>
    <Toast trigger={refreshErrorAt} icon="sync-error" message="Couldn’t refresh. Showing the forecast saved on this device." actionLabel="Retry" onAction={refresh} />
    </View>
  );
}

/* ───────────── Hero: sky behind the status bar, header, immersive lake ───────────── */

const sky = {
  day: { top: '#CFE2E0', horizon: '#EDF1EA' },
  night: { top: '#B7C5CD', horizon: '#E2E8E6' },
};

function Hero({ now, source, fresh, refreshing, onRefresh, night, children }: { now: number; source: string; fresh: { state: 'fresh' | 'aging' | 'stale'; label: string }; refreshing: boolean; onRefresh: () => void; night: boolean; children?: ReactNode }) {
  const insets = useSafeAreaInsets();
  const tone = night ? sky.night : sky.day;
  const stale = fresh.state === 'stale';
  return (
    <View style={[styles.hero, { paddingTop: insets.top + spacing.sm }]}>
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <LinearGradient id="pageSky" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={tone.top} />
            <Stop offset={children ? '0.62' : '0.8'} stopColor={tone.horizon} />
            <Stop offset="1" stopColor={children ? tone.horizon : colors.cream} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#pageSky)" />
      </Svg>

      <Row justify="space-between" align="flex-end" gap={spacing.md} style={styles.heroHeader}>
        <View style={{ flexShrink: 1, gap: 2 }}>
          <T variant="label" color={colors.tealDeep} numberOfLines={1}>
            {new Date(now).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} · {source}
          </T>
          <T variant="title" accessibilityRole="header">Today</T>
        </View>
        <Pressable
          disabled={!stale || refreshing}
          onPress={onRefresh}
          accessibilityRole={stale ? 'button' : 'text'}
          accessibilityLabel={stale ? `${fresh.label}. Refresh` : fresh.label}
          hitSlop={hitSlop}
          style={({ pressed }) => [styles.freshPill, stale && styles.freshPillStale, pressed && { opacity: 0.7 }]}
        >
          <Icon name={stale ? (refreshing ? 'sync-pending' : 'refresh') : 'clock'} size={12} color={stale ? colors.warning : colors.inkSoft} />
          <T variant="caption" weight="700" color={stale ? colors.warning : colors.inkSoft} numberOfLines={1}>
            {refreshing ? 'Refreshing…' : fresh.label}
          </T>
        </Pressable>
      </Row>

      {children}
    </View>
  );
}

/* ───────────── Floating readout: lake → scrubbed hour → score → reasons → confidence → window ───────────── */

function ReadoutCard({ entry, isTop, index, onIndexChange, now }: { entry: LakeData; isTop: boolean; index: number; onIndexChange: (i: number) => void; now: number }) {
  const { lake, forecast, season } = entry;
  const hour = forecast.hours[Math.min(index, forecast.hours.length - 1)];
  const broad = forecast.predictionGranularity === 'time_block';
  const band = scoreBands[scoreBand(hour.score)];
  const hourMs = new Date(hour.ts).getTime();
  const containing = forecast.windows.find((w) => w.hours.some((h) => h.ts === hour.ts));
  const next = containing ? undefined : upcomingWindows(forecast.windows, Math.max(now, hourMs)).find((w) => new Date(w.start).getTime() > hourMs);
  const timeLabel = broad
    ? `Broad block · ${formatDay(hour.ts)} ${shortClock(hour.ts)}`
    : index === 0 ? 'Now' : `${formatDay(hour.ts)} · ${shortClock(hour.ts)}`;

  return (
    <Card style={styles.readout}>
      {/* Header: lake + link */}
      <Row gap={spacing.sm} style={styles.skyHeader}>
        <Icon name={season === 'ice' ? 'ice' : 'open-water'} size={14} color={colors.teal} />
        <T variant="subhead" style={{ flexShrink: 1 }} numberOfLines={1}>{lake.name}</T>
        {isTop ? <View style={styles.topTag}><T variant="label" color={colors.sunriseInk} style={{ fontSize: 9 }}>Top pick</T></View> : null}
        <View style={{ flex: 1 }} />
        <LinkButton icon="chevron-right" onPress={() => router.push({ pathname: '/lake/[id]', params: { id: lake.id } })}>Forecast</LinkButton>
      </Row>

      {/* Readout for the scrubbed hour: score → reasons → confidence → window status */}
      <View style={{ gap: spacing.md }} accessibilityLiveRegion="polite">
        <Row justify="space-between" align="center" style={{ minHeight: 20 }}>
          <T variant="label" color={colors.inkMuted} style={{ flexShrink: 1 }} numberOfLines={1}>{timeLabel}</T>
          {index !== 0 ? (
            <Pressable onPress={() => onIndexChange(0)} hitSlop={hitSlop} accessibilityRole="button" accessibilityLabel="Back to now" style={({ pressed }) => [styles.nowPill, pressed && { opacity: 0.6 }]}>
              <Icon name="restore" size={12} color={colors.teal} />
              <T variant="caption" weight="700" color={colors.teal}>Now</T>
            </Pressable>
          ) : null}
        </Row>
        <Row gap={spacing.lg} align="center" style={{ marginTop: -spacing.sm }}>
          <View>
            <T variant="numeralL">{hour.score}</T>
            <T variant="caption" weight="700" color={band.color}>{band.label}</T>
          </View>
          <View style={{ flex: 1, gap: spacing.sm }}>
            <ReasonLine reasons={hour.reasons} />
            <ConfidenceMeter value={hour.confidence} />
          </View>
        </Row>
        {containing ? (
          <Row gap={spacing.sm} style={[styles.status, styles.statusLive]}>
            <View style={styles.windowSwatch} />
            <T variant="callout" weight="700" color={colors.sunriseInk} style={{ flex: 1 }}>
              {broad ? 'In a broad block' : 'In a window'} · {shortRange(containing.start, windowEnd(containing))}
              {index === 0 ? ` · ${formatDuration(new Date(windowEnd(containing)).getTime() - now)} left` : ''}
            </T>
          </Row>
        ) : next ? (
          <Row gap={spacing.sm} style={styles.status}>
            <Icon name="clock" size={14} color={colors.inkMuted} />
            <T variant="callout" color={colors.inkSoft} style={{ flex: 1 }}>
              Next {broad ? 'broad block' : 'window'} <T variant="callout" weight="700">{formatDay(next.start).toLowerCase()} {shortRange(next.start, windowEnd(next))}</T>{broad ? '' : ` · peak ${next.peakScore}`}
            </T>
          </Row>
        ) : (
          <T variant="callout" color={colors.inkMuted}>No window above 60 in this forecast.</T>
        )}
      </View>

      {broad ? (
        <T variant="caption" color={colors.inkMuted} align="center">
          Broad time-block outlooks repeat across the day; they are not exact hourly predictions.
        </T>
      ) : null}
    </Card>
  );
}

/* ───────────── Compact lake list ───────────── */

function LakeList({ entries, focusId, onFocus, now, canAdd, count }: { entries: LakeData[]; focusId: string; onFocus: (id: string) => void; now: number; canAdd: boolean; count: number }) {
  return (
    <Card style={{ gap: 0, paddingVertical: spacing.xs }}>
      {entries.map((entry, index) => {
        const { lake, next, live, forecast, season } = entry;
        const broad = forecast.predictionGranularity === 'time_block';
        const current = forecast.hours[0];
        const score = next?.peakScore ?? current.score;
        const when = next
          ? live
            ? `On now · ${formatDuration(new Date(windowEnd(next)).getTime() - now)} left`
            : `${formatDay(next.start)} ${shortRange(next.start, windowEnd(next))}`
          : 'No window this week';
        const reason = (next?.reasons ?? current.reasons)[0] ?? 'Mixed conditions';
        const confidence = next?.confidence ?? current.confidence;
        return (
          <View key={lake.id}>
            {index > 0 ? <Divider /> : null}
            <Pressable
              onPress={() => onFocus(lake.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: lake.id === focusId }}
              accessibilityLabel={`${lake.name}, ${seasonLabel(season).toLowerCase()}. ${when}. ${broad ? 'Broad block' : next ? 'Peak' : 'Now'} bite score ${score}, ${conditionLabel(score)}. ${reason}. ${confidence} confidence.`}
              accessibilityHint="Shows this lake in the sky chart above"
              style={({ pressed }) => [styles.lakeRow, lake.id === focusId && styles.lakeRowFocus, pressed && { opacity: 0.7 }]}
            >
              <Row gap={spacing.md} align="center">
                <View style={{ flex: 1, gap: 2 }}>
                  <Row gap={6}>
                    <T variant="subhead" numberOfLines={1} style={{ flexShrink: 1 }}>{lake.name}</T>
                    {lake.id === focusId ? <T variant="caption" weight="700" color={colors.teal}>· in the sky</T> : null}
                  </Row>
                  <T variant="caption" weight="700" color={live ? colors.sunriseInk : colors.inkSoft}>{when}</T>
                  <T variant="caption" color={colors.inkMuted} numberOfLines={1}>{reason} · {confidence} confidence</T>
                </View>
                <ScoreReadout score={score} size="sm" caption={broad ? 'Block' : next ? 'Peak' : 'Now'} />
              </Row>
              <DayStrip hours={forecast.hours} windows={forecast.windows} axis={false} />
            </Pressable>
          </View>
        );
      })}
      {canAdd ? (
        <>
          <Divider />
          <Pressable
            onPress={() => router.push('/(tabs)/map')}
            accessibilityRole="button"
            accessibilityLabel={`Follow another lake. ${count} of ${MAX_LAKES} followed.`}
            style={({ pressed }) => [styles.addRow, pressed && { opacity: 0.6 }]}
          >
            <View style={styles.addIcon}><Icon name="plus" size={16} color={colors.teal} /></View>
            <T variant="callout" weight="700" color={colors.teal} style={{ flex: 1 }}>Follow another lake</T>
            <T variant="caption" color={colors.inkMuted}>{count} of {MAX_LAKES}</T>
          </Pressable>
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  skyHeader: { paddingBottom: spacing.sm, marginBottom: -spacing.xs, borderBottomWidth: StyleSheet.hairlineWidth * 2, borderBottomColor: colors.line, marginHorizontal: -spacing.lg, paddingHorizontal: spacing.lg },
  status: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.sm, backgroundColor: colors.fog },
  statusLive: { backgroundColor: colors.sunriseTint },
  hero: { marginHorizontal: -spacing.xl, marginTop: -spacing.lg, overflow: 'hidden' },
  heroHeader: { paddingHorizontal: spacing.xl, paddingBottom: spacing.sm },
  freshPill: { flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: 190, paddingHorizontal: spacing.sm + 2, paddingVertical: 6, marginBottom: 4, borderRadius: radius.pill, backgroundColor: 'rgba(251,250,245,0.72)', borderWidth: 1, borderColor: 'rgba(191,200,194,0.6)' },
  freshPillStale: { backgroundColor: colors.warningTint, borderColor: colors.warningLine },
  float: { marginTop: -FLOAT_OVERLAP },
  readout: { gap: spacing.md + 2, borderRadius: radius.xl, backgroundColor: colors.white, borderWidth: 0, ...elevation.raised },
  nowPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm + 2, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.tealMist },
  topTag: { backgroundColor: colors.sunriseTint, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.xs },
  lakeRowFocus: { borderLeftWidth: 3, borderLeftColor: colors.teal, paddingLeft: spacing.md, marginLeft: -spacing.lg + 3, paddingRight: 0 },
  windowSwatch: { width: 14, height: 5, borderRadius: 3, backgroundColor: colors.sunrise },
  lakeRow: { gap: spacing.sm, paddingVertical: spacing.md },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: touch.comfortable, paddingTop: spacing.xs },
  addIcon: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.teal, alignItems: 'center', justifyContent: 'center' },
});
