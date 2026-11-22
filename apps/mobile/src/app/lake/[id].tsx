import { useState } from 'react';
import type { ForecastHour, ForecastWindow } from '@bitecast/engine';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { ForecastFootnote, HourlyChart, SevenDayOutlook, conditionLabel, formatWindow, hoursFromNow, upcomingWindows, windowEnd } from '@/components/forecast';
import { Icon } from '@/components/icon';
import { ConfidenceBars, ScoreBadge } from '@/components/score-badge';
import { Banner, Button, Card, Divider, EmptyState, IceSafetyNotice, LinkButton, ListRow, OfflineBanner, Reveal, Row, Screen, SectionHeader, Segmented, T } from '@/components/ui';
import { colors, hitSlop, radius, scoreBand, scoreBands, spacing } from '@/constants/theme';
import { forecastSource, freshness, useForecast } from '@/data/forecasts';
import { lakes } from '@/data/lakes';
import { sourceLabel, useLakeCondition } from '@/features/lake-season';
import { capitalize, formatDay, formatDuration, reasonIcon } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useNow } from '@/lib/use-now';
import { useAppStore } from '@/store/use-app-store';

/*
 * Lake detail answers, in order: how is it now and why (hero) → when is it good next →
 * hour by hour → the week → regulations and logging. Each reason list appears once.
 */

const INITIAL_WINDOWS = 3;

/** “Today”, “Tomorrow”, else a short weekday + date. */
const dayLabel = (value: string) => {
  const day = formatDay(value);
  return day === 'Today' || day === 'Tomorrow' ? day : new Date(value).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
};

export default function LakeForecastScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const lake = lakes.find((item) => item.id === id);
  const condition = useLakeCondition(lake?.id ?? '');
  const season = condition.season;
  const setLakeSeason = useAppStore((state) => state.setLakeSeason);
  const followed = useAppStore((state) => state.followedLakeIds);
  const toggle = useAppStore((state) => state.toggleLake);
  const isPro = useAppStore((state) => state.isPro);
  const query = useForecast(lake?.id ?? '', season);
  const [showAll, setShowAll] = useState(false);
  const now = useNow();

  if (!lake) {
    return (
      <Screen header>
        <EmptyState icon="lake" title="Lake not found" body="This lake may have been removed from coverage. Pick another from the map." action={<Button onPress={() => router.replace('/(tabs)/map')}>Open the map</Button>} />
      </Screen>
    );
  }

  const forecast = query.data;
  const hours = hoursFromNow(forecast.hours, now);
  const current = hours[0];
  const isFollowing = followed.includes(lake.id);
  const atLimit = !isFollowing && followed.length >= 5;
  const fresh = freshness(query.dataUpdatedAt, now);
  const windows = upcomingWindows(forecast.windows, now);
  const visibleWindows = showAll ? windows : windows.slice(0, INITIAL_WINDOWS);
  const next = windows[0];
  const broad = forecast.predictionGranularity === 'time_block';
  const openWindow = (window: ForecastWindow) => router.push({ pathname: '/lake/[id]/window/[start]', params: { id: lake.id, start: window.start } });

  const follow = (
    <Pressable
      onPress={() => {
        if (atLimit) { haptic.warning(); return; }
        haptic.select();
        toggle(lake.id);
      }}
      hitSlop={hitSlop}
      accessibilityRole="switch"
      accessibilityState={{ checked: isFollowing, disabled: atLimit }}
      accessibilityLabel={isFollowing ? `Following ${lake.name}` : `Follow ${lake.name}`}
      accessibilityHint={atLimit ? 'You already follow 5 lakes' : 'Shows this lake on Today'}
      style={({ pressed }) => [styles.follow, isFollowing && styles.following, atLimit && { opacity: 0.5 }, pressed && { opacity: 0.7 }]}
    >
      <Icon name={isFollowing ? 'check' : 'plus'} size={13} color={isFollowing ? colors.onDark : colors.teal} />
      <T variant="caption" weight="600" color={isFollowing ? colors.onDark : colors.teal}>{isFollowing ? 'Following' : 'Follow'}</T>
    </Pressable>
  );

  return (
    <Screen header refreshing={query.isRefetching} onRefresh={() => query.refetch()}>
      <Stack.Screen options={{ title: lake.name, headerRight: () => follow }} />

      <Reveal index={0}>
        <Hero
          score={current.score}
          reasons={current.reasons}
          confidence={current.confidence}
          meta={`${lake.region} · ${capitalize(lake.clarity)} water`}
          updated={`${fresh.label} · ${forecastSource(forecast)}`}
          stale={fresh.state === 'stale'}
          next={next}
          now={now}
          broad={broad}
          onWindow={openWindow}
        />
      </Reveal>

      {/* Season: one slim row; it changes which model scores this lake. */}
      <View style={{ gap: 4 }}>
        <Row gap={spacing.md} align="center">
          <View style={{ flex: 1, gap: 1 }}>
            <T variant="callout" weight="600">Fishing on</T>
            <T variant="caption" color={colors.inkMuted} numberOfLines={2} accessibilityLiveRegion="polite">{sourceLabel(condition)}</T>
          </View>
          <View style={{ width: 176 }}>
            <Segmented
              label={`Fishing ${lake.name} on`}
              value={season}
              onChange={(value) => setLakeSeason(lake.id, value)}
              options={[
                { label: 'Open', value: 'open_water', icon: 'open-water', accessibilityLabel: 'Open water' },
                { label: 'Ice', value: 'ice', icon: 'ice' },
              ]}
            />
          </View>
        </Row>
        {condition.source === 'manual' ? (
          <View style={{ alignItems: 'flex-start' }}>
            <LinkButton onPress={() => setLakeSeason(lake.id, null)}>Use typical season</LinkButton>
          </View>
        ) : null}
      </View>

      {season === 'ice' ? <IceSafetyNotice /> : null}
      <OfflineBanner />
      {query.isRefetchError ? <Banner tone="warning" title="Couldn’t refresh" body="Showing the forecast saved on this device." action={{ label: 'Try again', onPress: () => query.refetch() }} live /> : null}
      {!query.isRefetchError && fresh.state === 'stale' ? <Banner tone="warning" icon="clock" title={fresh.label} body="Conditions may have changed since this forecast was saved." action={{ label: 'Refresh', onPress: () => query.refetch() }} /> : null}

      <SectionHeader title="Next 24 hours" caption={broad ? 'Broad blocks · tap a bar for that time' : 'Bite score by hour · tap a bar'} />
      <HourlyChart hours={hours} windows={forecast.windows} nowShownAbove />

      <SectionHeader title="Windows this week" caption={`Stretches scoring 60 or more${windows.length ? ` · ${windows.length} ahead` : ''}`} />
      {windows.length ? (
        <Card style={{ gap: 0, paddingVertical: spacing.xs }}>
          {visibleWindows.map((window, index) => (
            <View key={window.id}>
              {index > 0 ? <Divider /> : null}
              <WindowRow window={window} now={now} onPress={() => openWindow(window)} />
            </View>
          ))}
          {windows.length > INITIAL_WINDOWS ? (
            <>
              <Divider />
              <LinkButton icon={showAll ? 'chevron-up' : 'chevron-down'} onPress={() => setShowAll((value) => !value)}>
                {showAll ? 'Show fewer' : `Show all ${windows.length}`}
              </LinkButton>
            </>
          ) : null}
        </Card>
      ) : (
        <Card variant="sunken">
          <T variant="subhead">No strong windows this week</T>
          <T variant="callout" color={colors.inkSoft}>Scores don’t cross 60 in the forecast period. The chart above shows the better hours.</T>
        </Card>
      )}

      <SectionHeader title="7-day outlook" caption={broad ? 'Best broad block each day' : 'Best hour each day'} />
      <SevenDayOutlook hours={hours} />
      {!isPro ? (
        <Pressable
          onPress={() => router.push('/paywall')}
          accessibilityRole="button"
          accessibilityLabel="BiteCast Pro: the full seven days and alerts before windows open"
          style={({ pressed }) => [styles.pro, pressed && { opacity: 0.8 }]}
        >
          <Icon name="pro" size={18} color={colors.sunriseInk} />
          <T variant="callout" style={{ flex: 1 }}>
            <T variant="callout" weight="600">Pro</T> adds all 7 days and alerts before windows open
          </T>
          <Icon name="chevron-right" size={14} color={colors.inkFaint} />
        </Pressable>
      ) : null}

      <Card style={{ gap: 0, paddingVertical: spacing.xs }}>
        <ListRow icon="document" title="Walleye regulations" subtitle="Season, limits and the official source" onPress={() => router.push({ pathname: '/lake/[id]/regulations', params: { id: lake.id } })} />
        <Divider />
        <ListRow icon="plus" title="Log a trip here" subtitle="Free · saved on this phone first" onPress={() => router.push({ pathname: '/log/new', params: { lakeId: lake.id } })} />
      </Card>

      <ForecastFootnote engineVersion={forecast.engineVersion} predictionGranularity={forecast.predictionGranularity} />
    </Screen>
  );
}

/* ───────────── Hero: now → why → how sure → next window ───────────── */

function Hero({ score, reasons, confidence, meta, updated, stale, next, now, broad, onWindow }: {
  score: number;
  reasons: string[];
  confidence: ForecastHour['confidence'];
  meta: string;
  updated: string;
  stale: boolean;
  next?: ForecastWindow;
  now: number;
  broad: boolean;
  onWindow: (window: ForecastWindow) => void;
}) {
  const band = scoreBands[scoreBand(score)];
  const live = next ? new Date(next.start).getTime() <= now : false;
  const status = next
    ? live
      ? `Open now · ${formatDuration(new Date(windowEnd(next)).getTime() - now)} left`
      : `${dayLabel(next.start)} ${formatWindow(next)} · in ${formatDuration(new Date(next.start).getTime() - now)}`
    : 'No window above 60 this week';
  return (
    <View style={styles.hero}>
      {/* Band-coloured wash, as on Today */}
      <Svg style={styles.wash} pointerEvents="none">
        <Defs>
          <LinearGradient id="heroWash" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={band.tint} stopOpacity={1} />
            <Stop offset="1" stopColor={band.tint} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#heroWash)" />
      </Svg>

      <Row gap={spacing.lg} align="center">
        <View style={{ flex: 1, gap: spacing.xs }}>
          <T variant="label" color={colors.teal} numberOfLines={1}>{meta}</T>
          <T variant="title" style={{ fontSize: 26, lineHeight: 31 }} accessibilityRole="header">{conditionLabel(score)}</T>
          <Row gap={6}>
            <Icon name={stale ? 'warning' : 'clock'} size={12} color={stale ? colors.warning : colors.inkMuted} />
            <T variant="caption" color={stale ? colors.warning : colors.inkMuted} numberOfLines={1} style={{ flexShrink: 1 }}>{updated}</T>
          </Row>
        </View>
        <ScoreBadge score={score} size="lg" caption="Now" />
      </Row>

      <View style={{ gap: spacing.sm }}>
        {(reasons.length ? reasons.slice(0, 3) : ['Mixed conditions']).map((reason) => (
          <Row key={reason} gap={spacing.sm}>
            <Icon name={reasonIcon(reason)} size={15} color={colors.teal} />
            <T variant="callout" style={{ flex: 1 }}>{reason}</T>
          </Row>
        ))}
        <ConfidenceBars level={confidence} long />
      </View>

      {/* Next window: the one action the hero leads to */}
      <Pressable
        disabled={!next}
        onPress={() => next && onWindow(next)}
        accessibilityRole={next ? 'button' : 'text'}
        accessibilityLabel={`${next ? (broad ? 'Next block' : 'Next window') : ''} ${status}${next ? `, peak ${next.peakScore}` : ''}`}
        accessibilityHint={next ? 'Opens the light curve and tactics' : undefined}
        style={({ pressed }) => [styles.next, live && styles.nextLive, pressed && { opacity: 0.8 }]}
      >
        {live ? <View style={styles.liveDot} /> : <Icon name="clock" size={14} color={colors.sunriseInk} />}
        <T variant="callout" weight="600" color={next ? colors.sunriseInk : colors.inkSoft} style={{ flex: 1 }} numberOfLines={1}>{status}</T>
        {next ? <Icon name="chevron-right" size={14} color={colors.sunriseInk} /> : null}
      </Pressable>
    </View>
  );
}

/* ───────────── Windows: compact rows, tap for the full window detail ───────────── */

function WindowRow({ window, now, onPress }: { window: ForecastWindow; now: number; onPress: () => void }) {
  const live = new Date(window.start).getTime() <= now;
  const reason = window.reasons[0] ?? 'Mixed conditions';
  const broad = window.predictionGranularity === 'time_block';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${dayLabel(window.start)}, ${formatWindow(window)}${live ? ', open now' : ''}. ${broad ? 'Block' : 'Peak'} bite score ${window.peakScore}, ${scoreBands[scoreBand(window.peakScore)].label}. ${window.reasons.slice(0, 3).join(', ')}. ${window.confidence} confidence.`}
      accessibilityHint="Opens light curve, contributors and tactics"
      style={({ pressed }) => [styles.windowRow, pressed && { opacity: 0.7 }]}
    >
      <ScoreBadge score={window.peakScore} />
      <View style={{ flex: 1, gap: 2 }}>
        <Row gap={6}>
          {live ? <View style={styles.liveDot} /> : null}
          <T variant="label" color={colors.sunriseInk} numberOfLines={1}>{live ? 'Open now' : dayLabel(window.start)}</T>
        </Row>
        <T variant="subhead" numberOfLines={1}>{capitalize(formatWindow(window))}</T>
        <Row gap={6}>
          <Icon name={reasonIcon(reason)} size={12} color={colors.teal} />
          <T variant="caption" color={colors.inkMuted} numberOfLines={1} style={{ flex: 1 }}>{reason}</T>
          <ConfidenceBars level={window.confidence} bare />
        </Row>
      </View>
      <Icon name="chevron-right" size={15} color={colors.inkFaint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  follow: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 32, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.teal },
  following: { backgroundColor: colors.teal },
  hero: { gap: spacing.lg, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.paper, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth * 2, borderColor: colors.line },
  wash: { position: 'absolute', top: 0, left: 0, right: 0, height: 130 },
  next: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: colors.sunriseTint },
  nextLive: { borderWidth: 1, borderColor: colors.sunrise },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.sunrise },
  windowRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  pro: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48, paddingHorizontal: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
});
