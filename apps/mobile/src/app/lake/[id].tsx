import { useState } from 'react';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { ConfidenceMeter, ForecastFootnote, HourlyChart, ReasonLine, ScoreReadout, SevenDayOutlook, WindowCard, conditionLabel, upcomingWindows } from '@/components/forecast';
import { Icon } from '@/components/icon';
import { Banner, Button, Card, EmptyState, IceSafetyNotice, LinkButton, ListRow, OfflineBanner, Reveal, Row, Screen, SectionHeader, Segmented, T } from '@/components/ui';
import { colors, hitSlop, radius, spacing, touch } from '@/constants/theme';
import { forecastSource, freshness, useForecast } from '@/data/forecasts';
import { lakes } from '@/data/lakes';
import { capitalize } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useNow } from '@/lib/use-now';
import { seasonLabel, sourceLabel, useLakeCondition } from '@/features/lake-season';
import { useAppStore } from '@/store/use-app-store';

const INITIAL_WINDOWS = 3;

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
  const current = forecast.hours[0];
  const isFollowing = followed.includes(lake.id);
  const atLimit = !isFollowing && followed.length >= 5;
  const fresh = freshness(query.dataUpdatedAt, now);
  const windows = upcomingWindows(forecast.windows, now);
  const visibleWindows = showAll ? windows : windows.slice(0, INITIAL_WINDOWS);

  return (
    <Screen header refreshing={query.isRefetching} onRefresh={() => query.refetch()}>
      <Stack.Screen options={{ title: lake.name }} />
      <Row gap={spacing.md} align="flex-end">
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="label" color={colors.teal}>{lake.region} · {capitalize(lake.clarity)} water</T>
          <T variant="title" accessibilityRole="header">{lake.name}</T>
          <Row gap={6}>
            <Icon name={fresh.state === 'stale' ? 'warning' : 'clock'} size={13} color={fresh.state === 'stale' ? colors.warning : colors.inkMuted} />
            <T variant="caption" color={fresh.state === 'stale' ? colors.warning : colors.inkMuted}>{fresh.label} · {forecastSource(query.data)}</T>
          </Row>
        </View>
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
          accessibilityHint={atLimit ? 'You already follow 5 lakes' : undefined}
          style={[styles.follow, isFollowing && styles.following, atLimit && { opacity: 0.5 }]}
        >
          <Icon name={isFollowing ? 'check' : 'plus'} size={14} color={isFollowing ? colors.onDark : colors.teal} />
          <T variant="callout" weight="700" color={isFollowing ? colors.onDark : colors.teal}>{isFollowing ? 'Following' : 'Follow'}</T>
        </Pressable>
      </Row>

      <Card style={{ gap: spacing.sm, paddingVertical: spacing.md }}>
        <Row justify="space-between" align="center">
          <T variant="callout" weight="700">Fishing this lake on</T>
          {condition.source === 'manual' ? (
            <LinkButton onPress={() => setLakeSeason(lake.id, null)}>Use typical</LinkButton>
          ) : null}
        </Row>
        <Segmented
          label={`Fishing ${lake.name} on`}
          value={season}
          onChange={(next) => setLakeSeason(lake.id, next)}
          options={[
            { label: 'Open water', value: 'open_water', icon: 'open-water' },
            { label: 'Ice', value: 'ice', icon: 'ice' },
          ]}
        />
        <T variant="caption" color={colors.inkMuted} accessibilityLiveRegion="polite">
          {sourceLabel(condition)} · scores and tactics use {seasonLabel(season).toLowerCase()} conditions.
        </T>
      </Card>
      {season === 'ice' ? <IceSafetyNotice /> : null}
      <OfflineBanner />
      {query.isRefetchError ? <Banner tone="warning" title="Couldn’t refresh" body="Showing the forecast saved on this device." action={{ label: 'Try again', onPress: () => query.refetch() }} live /> : null}
      {!query.isRefetchError && fresh.state === 'stale' ? <Banner tone="warning" icon="clock" title={fresh.label} body="Conditions may have changed since this forecast was saved." action={{ label: 'Refresh', onPress: () => query.refetch() }} /> : null}

      <Reveal index={0}>
        <Card style={{ gap: spacing.md, backgroundColor: colors.white }}>
          <Row gap={spacing.lg} align="center">
            <ScoreReadout score={current.score} size="lg" caption="Now" />
            <View style={{ flex: 1, gap: spacing.xs }}>
              <T variant="label" color={colors.teal}>Right now</T>
              <T variant="headline">{conditionLabel(current.score)}</T>
              <ConfidenceMeter value={current.confidence} />
            </View>
          </Row>
          <ReasonLine reasons={current.reasons} limit={3} />
        </Card>
      </Reveal>

      <SectionHeader title="Next 24 hours" caption="Bite score by hour" />
      <HourlyChart hours={forecast.hours} windows={forecast.windows} />

      <SectionHeader title="Upcoming windows" caption="Stretches scoring 60 or more" />
      {windows.length ? (
        <>
          {visibleWindows.map((window, index) => (
            <Reveal key={window.id} index={index}>
              <WindowCard window={window} onPress={() => router.push({ pathname: '/lake/[id]/window/[start]', params: { id: lake.id, start: window.start } })} />
            </Reveal>
          ))}
          {windows.length > INITIAL_WINDOWS ? (
            <Button variant="secondary" size="md" icon={showAll ? 'chevron-up' : 'chevron-down'} onPress={() => setShowAll((value) => !value)}>
              {showAll ? 'Show fewer windows' : `Show all ${windows.length} windows this week`}
            </Button>
          ) : null}
        </>
      ) : (
        <Card variant="sunken">
          <T variant="subhead">No strong windows this week</T>
          <T variant="callout" color={colors.inkSoft}>Scores don’t cross 60 in the forecast period. Use the hourly chart to find the better hours.</T>
        </Card>
      )}

      {!isPro ? (
        <Card variant="outline" style={{ gap: spacing.sm }}>
          <Row gap={spacing.sm}>
            <Icon name="pro" size={18} color={colors.sunriseInk} />
            <T variant="subhead">Get alerts before windows open</T>
          </Row>
          <T variant="callout" color={colors.inkSoft}>Pro adds window alerts, the full seven-day outlook and personal patterns from your logs.</T>
          <Button size="md" variant="secondary" onPress={() => router.push('/paywall')}>See BiteCast Pro</Button>
        </Card>
      ) : null}

      <SectionHeader title="7-day outlook" caption="Best hour each day" />
      <SevenDayOutlook hours={forecast.hours} />

      <Card style={{ gap: 0, paddingVertical: spacing.xs }}>
        <ListRow icon="document" title="Walleye regulations" subtitle="Season, limits and the official source" onPress={() => router.push({ pathname: '/lake/[id]/regulations', params: { id: lake.id } })} />
      </Card>
      <Button icon="plus" variant="secondary" onPress={() => router.push({ pathname: '/log/new', params: { lakeId: lake.id } })}>{`Log a trip on ${lake.name}`}</Button>

      <ForecastFootnote engineVersion={forecast.engineVersion} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  follow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: touch.min, paddingHorizontal: spacing.lg, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.teal, marginBottom: 2 },
  following: { backgroundColor: colors.teal },
});
