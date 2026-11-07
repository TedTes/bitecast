import { useState } from 'react';
import { router } from 'expo-router';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import type { LakeForecast } from '@bitecast/engine';
import { StyleSheet, View } from 'react-native';
import { ChartTexture } from '@/components/brand';
import { ConfidenceMeter, DayStrip, ForecastFootnote, ReasonChips, ScoreReadout, bestWindowWithin, conditionLabel, formatWindow } from '@/components/forecast';
import { Icon } from '@/components/icon';
import { Banner, Button, Card, EmptyState, ErrorState, IceSafetyNotice, LinkButton, OfflineBanner, Reveal, Row, Screen, SectionHeader, Segmented, SkeletonCard, T } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { DATA_SOURCE_LABEL, forecastQuery, freshness } from '@/data/forecasts';
import { lakeById } from '@/data/lakes';
import { capitalize, formatDay } from '@/lib/format';
import { useNow } from '@/lib/use-now';
import { useAppStore } from '@/store/use-app-store';
import type { Lake } from '@/types/app';

type Entry = { lake: Lake; forecast: LakeForecast; updatedAt: number };

export default function TodayScreen() {
  const ids = useAppStore((state) => state.followedLakeIds);
  const season = useAppStore((state) => state.settings.season);
  const setSeason = useAppStore((state) => state.setSeason);
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const now = useNow();
  const queries = useQueries({ queries: ids.map((id) => forecastQuery(id, season)) });

  const refresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['forecast'] }).catch(() => undefined);
    setRefreshing(false);
  };

  const entries: Entry[] = queries.flatMap((query, index) => (query.data ? [{ lake: lakeById(ids[index]), forecast: query.data, updatedAt: query.dataUpdatedAt }] : []));
  const loading = queries.some((query) => query.isPending);
  const failed = queries.length > 0 && queries.every((query) => query.isError && !query.data);
  const refreshFailed = queries.some((query) => query.isRefetchError);
  const oldest = entries.length ? Math.min(...entries.map((entry) => entry.updatedAt)) : now;
  const fresh = freshness(oldest, now);

  const ranked = entries
    .map((entry) => ({ ...entry, window: bestWindowWithin(entry.forecast.windows, 24, now) }))
    .sort((a, b) => (b.window?.peakScore ?? 0) - (a.window?.peakScore ?? 0));
  const best = ranked[0]?.window ? ranked[0] : undefined;

  return (
    <Screen tab refreshing={refreshing} onRefresh={refresh}>
      <View style={{ gap: spacing.xs }}>
        <T variant="label" color={colors.teal}>{new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</T>
        <T variant="display" accessibilityRole="header">Today’s windows</T>
      </View>

      <Segmented
        label="Season"
        value={season}
        onChange={setSeason}
        options={[
          { label: 'Open water', value: 'open_water', icon: 'open-water' },
          { label: 'Ice season', value: 'ice', icon: 'ice' },
        ]}
      />
      {season === 'ice' ? <IceSafetyNotice /> : null}

      <OfflineBanner />
      {refreshFailed ? <Banner tone="warning" title="Couldn’t refresh" body="Showing the last forecast saved on this device." action={{ label: 'Try again', onPress: refresh, loading: refreshing }} live /> : null}
      {!refreshFailed && fresh.state === 'stale' && entries.length ? (
        <Banner tone="warning" icon="clock" title={fresh.label} body="Conditions may have changed. Pull down to refresh when you have signal." action={{ label: 'Refresh now', onPress: refresh, loading: refreshing }} />
      ) : null}

      {ids.length === 0 ? (
        <EmptyState
          icon="lake"
          title="No lakes followed yet"
          body="Follow up to five lakes to compare their best windows here."
          action={<Button icon="map" onPress={() => router.push('/(tabs)/map')}>Find lakes on the map</Button>}
        />
      ) : failed ? (
        <ErrorState title="Forecasts unavailable" body="We couldn’t load forecasts and nothing is saved on this device yet. Check your connection and try again." onRetry={refresh} retrying={refreshing} />
      ) : loading && !entries.length ? (
        <>
          <SkeletonCard lines={4} />
          <SkeletonCard />
        </>
      ) : (
        <>
          {best?.window ? (
            <Reveal index={0}>
              <Card
                variant="ink"
                onPress={() => router.push({ pathname: '/lake/[id]', params: { id: best.lake.id } })}
                accessibilityLabel={`Best bet: ${best.lake.name}, ${formatDay(best.window.start)} ${formatWindow(best.window)}. Peak bite score ${best.window.peakScore}. ${best.window.reasons.slice(0, 3).join(', ')}. ${best.window.confidence} confidence.`}
                accessibilityHint="Opens the lake forecast"
                style={styles.hero}
              >
                <ChartTexture />
                <Row justify="space-between" align="flex-start" gap={spacing.md}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <T variant="label" color={colors.sunrise}>Best bet · {formatDay(best.window.start)}</T>
                    <T variant="title" color={colors.onDark}>{best.lake.name}</T>
                    <T variant="headline" color={colors.onDark} style={{ marginTop: spacing.xs }}>{formatWindow(best.window)}</T>
                  </View>
                  <ScoreReadout score={best.window.peakScore} size="lg" tone="dark" caption="Peak" />
                </Row>
                <ReasonChips reasons={best.window.reasons} tone="dark" />
                <Row justify="space-between">
                  <ConfidenceMeter value={best.window.confidence} tone="dark" />
                  <Row gap={4}>
                    <T variant="caption" weight="700" color={colors.mint}>Full forecast</T>
                    <Icon name="chevron-right" size={13} color={colors.mint} />
                  </Row>
                </Row>
              </Card>
            </Reveal>
          ) : null}

          <SectionHeader
            title={ids.length === 1 ? 'Your lake' : `Your ${ids.length} lakes`}
            caption={`${fresh.label} · ${DATA_SOURCE_LABEL}`}
            action={ids.length < 5 ? <LinkButton icon="plus" onPress={() => router.push('/(tabs)/map')}>Add</LinkButton> : undefined}
          />

          {ranked.map((entry, index) => {
            const w = entry.window;
            const now = entry.forecast.hours[0];
            return (
              <Reveal key={entry.lake.id} index={index + 1}>
                <Card
                  onPress={() => router.push({ pathname: '/lake/[id]', params: { id: entry.lake.id } })}
                  accessibilityLabel={`${entry.lake.name}. ${w ? `Best window ${formatDay(w.start)} ${formatWindow(w)}, peak score ${w.peakScore}. ${w.reasons.slice(0, 2).join(', ')}. ${w.confidence} confidence.` : `No window above 60 in the next 24 hours. Now ${now.score}, ${conditionLabel(now.score)}.`}`}
                  accessibilityHint="Opens the lake forecast"
                >
                  <Row gap={spacing.md} align="flex-start">
                    <View style={{ flex: 1, gap: 2 }}>
                      <T variant="headline">{entry.lake.name}</T>
                      <T variant="caption" color={colors.inkMuted}>{entry.lake.region} · {capitalize(entry.lake.clarity)} water</T>
                    </View>
                    <ScoreReadout score={w?.peakScore ?? now.score} caption={w ? 'Peak' : 'Now'} />
                  </Row>
                  <View style={styles.windowLine}>
                    <Icon name={w ? 'clock' : 'info'} size={16} color={w ? colors.sunriseInk : colors.inkMuted} />
                    <T variant="subhead" style={{ flex: 1 }} color={w ? colors.ink : colors.inkSoft}>
                      {w ? `${formatDay(w.start)} · ${formatWindow(w)}` : 'No window above 60 in the next 24 h'}
                    </T>
                  </View>
                  <ReasonChips reasons={w?.reasons ?? now.reasons} limit={2} />
                  <ConfidenceMeter value={w?.confidence ?? now.confidence} />
                  <DayStrip hours={entry.forecast.hours} windows={entry.forecast.windows} />
                </Card>
              </Reveal>
            );
          })}
        </>
      )}

      <ForecastFootnote />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { padding: spacing.xl, gap: spacing.lg, borderRadius: radius.xl },
  windowLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.line },
});
