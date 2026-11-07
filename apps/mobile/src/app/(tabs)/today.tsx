import { useState } from 'react';
import { router } from 'expo-router';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import type { ForecastWindow, LakeForecast, Season } from '@bitecast/engine';
import { Pressable, StyleSheet, View } from 'react-native';
import { ConfidenceMeter, DayStrip, ForecastFootnote, ReasonLine, ScoreReadout, conditionLabel, upcomingWindows, windowEnd } from '@/components/forecast';
import { Icon } from '@/components/icon';
import { SkyArc } from '@/components/sky-arc';
import { Banner, Button, Card, Divider, EmptyState, ErrorState, IceSafetyNotice, LinkButton, OfflineBanner, Reveal, Row, Screen, SkeletonCard, T } from '@/components/ui';
import { WalleyeArt } from '@/components/walleye';
import { colors, radius, scoreBand, scoreBands, spacing, touch } from '@/constants/theme';
import { DATA_SOURCE_LABEL, forecastQuery, freshness } from '@/data/forecasts';
import { lakeById } from '@/data/lakes';
import { seasonLabel, useConditionResolver } from '@/features/lake-season';
import { formatDay, formatDuration, shortClock, shortRange } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useNow } from '@/lib/use-now';
import { useAppStore } from '@/store/use-app-store';
import type { Lake } from '@/types/app';

const MAX_LAKES = 5;

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
  const refreshFailed = queries.some((query) => query.isRefetchError);
  const fresh = freshness(data.length ? Math.min(...data.map((entry) => entry.updatedAt)) : now, now);
  const focus = data.find((entry) => entry.lake.id === focusId) ?? data[0];

  const chooseLake = (id: string) => {
    if (id === focus?.lake.id) return;
    haptic.select();
    setFocusId(id);
    setHourIndex(0);
  };

  return (
    <Screen tab refreshing={refreshing} onRefresh={refresh}>
      <View style={{ gap: 4 }}>
        <T variant="label" color={colors.teal}>{new Date(now).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</T>
        <T variant="title" accessibilityRole="header">Today</T>
        <Row gap={5}>
          <Icon name={fresh.state === 'stale' ? 'warning' : 'clock'} size={12} color={fresh.state === 'stale' ? colors.warning : colors.inkMuted} />
          <T variant="caption" color={fresh.state === 'stale' ? colors.warning : colors.inkMuted}>{fresh.label} · {DATA_SOURCE_LABEL}</T>
        </Row>
      </View>

      {seasons.includes('ice') ? <IceSafetyNotice compact /> : null}
      <OfflineBanner />
      {refreshFailed ? <Banner tone="warning" title="Couldn’t refresh" body="Showing the last forecast saved on this device." action={{ label: 'Try again', onPress: refresh, loading: refreshing }} live /> : null}
      {!refreshFailed && fresh.state === 'stale' && data.length ? (
        <Banner tone="warning" icon="clock" title={fresh.label} body="Conditions may have changed. Pull down to refresh when you have signal." action={{ label: 'Refresh now', onPress: refresh, loading: refreshing }} />
      ) : null}

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
          <Reveal index={0}>
            <SkyCard entry={focus} isTop={focus.lake.id === data[0]?.lake.id} index={hourIndex} onIndexChange={setHourIndex} now={now} />
          </Reveal>
          <Reveal index={1}>
            <LakeList entries={data} focusId={focus.lake.id} onFocus={chooseLake} now={now} canAdd={ids.length < MAX_LAKES} count={ids.length} />
          </Reveal>
        </>
      ) : null}

      <ForecastFootnote />
    </Screen>
  );
}

/* ───────────── Sky card: lake → scrubbed hour readout → arc ───────────── */

function SkyCard({ entry, isTop, index, onIndexChange, now }: { entry: LakeData; isTop: boolean; index: number; onIndexChange: (i: number) => void; now: number }) {
  const { lake, forecast, season } = entry;
  const hour = forecast.hours[Math.min(index, forecast.hours.length - 1)];
  const band = scoreBands[scoreBand(hour.score)];
  const hourMs = new Date(hour.ts).getTime();
  const containing = forecast.windows.find((w) => w.hours.some((h) => h.ts === hour.ts));
  const next = containing ? undefined : upcomingWindows(forecast.windows, Math.max(now, hourMs)).find((w) => new Date(w.start).getTime() > hourMs);
  const timeLabel = index === 0 ? 'Now' : `${formatDay(hour.ts)} · ${shortClock(hour.ts)}`;

  return (
    <Card style={styles.sky}>
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
        <Row justify="space-between" align="flex-end">
          <View style={{ gap: 2 }}>
            <T variant="label" color={colors.inkMuted}>{timeLabel}</T>
            <Row gap={spacing.sm} align="flex-end">
              <T variant="numeralL">{hour.score}</T>
              <T variant="subhead" color={band.color} style={{ marginBottom: 5 }}>{band.label}</T>
            </Row>
          </View>
          <View style={{ marginBottom: 7 }}><ConfidenceMeter value={hour.confidence} /></View>
        </Row>
        <ReasonLine reasons={hour.reasons} />
        {containing ? (
          <Row gap={spacing.sm} style={[styles.status, styles.statusLive]}>
            <View style={styles.windowSwatch} />
            <T variant="callout" weight="700" color={colors.sunriseInk} style={{ flex: 1 }}>
              In a window · {shortRange(containing.start, windowEnd(containing))}
              {index === 0 ? ` · ${formatDuration(new Date(windowEnd(containing)).getTime() - now)} left` : ''}
            </T>
          </Row>
        ) : next ? (
          <Row gap={spacing.sm} style={styles.status}>
            <Icon name="clock" size={14} color={colors.inkMuted} />
            <T variant="callout" color={colors.inkSoft} style={{ flex: 1 }}>
              Next window <T variant="callout" weight="700">{formatDay(next.start).toLowerCase()} {shortRange(next.start, windowEnd(next))}</T> · peak {next.peakScore}
            </T>
          </Row>
        ) : (
          <T variant="callout" color={colors.inkMuted}>No window above 60 in this forecast.</T>
        )}
      </View>

      <SkyArc hours={forecast.hours} windows={forecast.windows} ice={season === 'ice'} index={index} onIndexChange={onIndexChange} />

      {index === 0 ? (
        <T variant="caption" color={colors.inkMuted} align="center">Drag across the sky to explore the next 24 hours</T>
      ) : (
        <Row justify="center"><LinkButton icon="restore" onPress={() => onIndexChange(0)}>Back to now</LinkButton></Row>
      )}
    </Card>
  );
}

/* ───────────── Compact lake list ───────────── */

function LakeList({ entries, focusId, onFocus, now, canAdd, count }: { entries: LakeData[]; focusId: string; onFocus: (id: string) => void; now: number; canAdd: boolean; count: number }) {
  return (
    <Card style={{ gap: 0, paddingVertical: spacing.xs }}>
      {entries.map((entry, index) => {
        const { lake, next, live, forecast, season } = entry;
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
              accessibilityLabel={`${lake.name}, ${seasonLabel(season).toLowerCase()}. ${when}. ${next ? 'Peak' : 'Now'} bite score ${score}, ${conditionLabel(score)}. ${reason}. ${confidence} confidence.`}
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
                <ScoreReadout score={score} size="sm" caption={next ? 'Peak' : 'Now'} />
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
  sky: { gap: spacing.lg, borderRadius: radius.xl, backgroundColor: colors.white },
  topTag: { backgroundColor: colors.sunriseTint, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.xs },
  lakeRowFocus: { borderLeftWidth: 3, borderLeftColor: colors.teal, paddingLeft: spacing.md, marginLeft: -spacing.lg + 3, paddingRight: 0 },
  windowSwatch: { width: 14, height: 5, borderRadius: 3, backgroundColor: colors.sunrise },
  lakeRow: { gap: spacing.sm, paddingVertical: spacing.md },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: touch.comfortable, paddingTop: spacing.xs },
  addIcon: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.teal, alignItems: 'center', justifyContent: 'center' },
});
