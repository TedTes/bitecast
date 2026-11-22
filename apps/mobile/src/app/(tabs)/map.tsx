import { useState } from 'react';
import { router } from 'expo-router';
import { useQueries } from '@tanstack/react-query';
import type { ForecastWindow, LakeForecast } from '@bitecast/engine';
import { ScrollView, StyleSheet, View } from 'react-native';
import { ReasonLine, bestWindowWithin, formatWindow, hoursFromNow } from '@/components/forecast';
import { Icon } from '@/components/icon';
import { ConfidenceBars, ScoreBadge } from '@/components/score-badge';
import { LakeMap, useMapMode, type MapLakePin } from '@/components/map/lake-map';
import { Banner, Button, Card, Chip, IceSafetyNotice, Row, Screen, Segmented, T } from '@/components/ui';
import { colors, spacing, TAB_BUTTON_RISE } from '@/constants/theme';
import { integrationsReady } from '@/api/config';
import { forecastQuery } from '@/data/forecasts';
import { lakes } from '@/data/lakes';
import { formatDay } from '@/lib/format';
import { useNow } from '@/lib/use-now';
import { publishedForecast } from '@/features/published-forecast';
import { haptic } from '@/lib/haptics';
import { seasonLabel, useConditionResolver } from '@/features/lake-season';
import { useAppStore } from '@/store/use-app-store';

export default function MapScreen() {
  const followed = useAppStore((state) => state.followedLakeIds);
  const resolve = useConditionResolver();
  const toggle = useAppStore((state) => state.toggleLake);
  const [view, setView] = useState<'map' | 'list'>('map');
  const [selectedId, setSelectedId] = useState<string>(followed[0] ?? lakes[0].id);
  const mode = useMapMode();
  const clock = useNow();
  const queries = useQueries({ queries: lakes.map((lake) => forecastQuery(lake.id, resolve(lake.id).season)) });

  const summaries = lakes.map((lake, index) => {
    const forecast = publishedForecast(queries[index].data, integrationsReady);
    const window = forecast ? bestWindowWithin(forecast.windows, 24, clock) : undefined;
    const now = forecast ? hoursFromNow(forecast.hours, clock)[0] : undefined;
    // No published forecast means no score, reason or confidence — never a stand-in number.
    const waiting = !forecast && queries[index].isFetching;
    return { lake, forecast, window, now, waiting, score: window?.peakScore ?? now?.score ?? null };
  });
  const pins: MapLakePin[] = summaries.map(({ lake, score }) => ({
    id: lake.id, name: lake.name, latitude: lake.latitude, longitude: lake.longitude, score,
    followed: followed.includes(lake.id), scale: lake.region === 'Great Lakes' ? 'large' : 'small',
  }));
  const selected = summaries.find((item) => item.lake.id === selectedId) ?? summaries[0];
  const selectedBroad = selected.forecast?.predictionGranularity === 'time_block';
  const isFollowing = followed.includes(selected.lake.id);
  const atLimit = !isFollowing && followed.length >= 5;

  const follow = () => {
    if (atLimit) { haptic.warning(); return; }
    haptic.select();
    toggle(selected.lake.id);
  };

  return (
    <Screen tab scroll={false} style={styles.screen}>
      <View style={styles.header}>
        <Row justify="space-between" align="flex-end">
          <View style={{ gap: 2 }}>
            <T variant="label" color={colors.teal}>Ontario + Great Lakes</T>
            <T variant="title" accessibilityRole="header">Lake map</T>
          </View>
          <Chip
            label={mode === 'cached' ? 'Offline chart' : 'Live map'}
            icon={mode === 'cached' ? 'device' : 'map'}
            tone={mode === 'cached' ? 'neutral' : 'teal'}
            accessibilityLabel={mode === 'cached' ? 'Offline chart. Lake positions are stored on this device.' : 'Live map'}
          />
        </Row>
        <Segmented label="View" value={view} onChange={setView} options={[{ label: 'Map', value: 'map', icon: 'map' }, { label: 'List', value: 'list', icon: 'filter' }]} />
        {view === 'map' ? <T variant="caption" color={colors.inkMuted}>{mode === 'cached' ? 'Offline chart · not to scale · not for navigation' : 'Not for navigation'}</T> : null}
        {view === 'map' && resolve(selected.lake.id).season === 'ice' ? <IceSafetyNotice compact /> : null}
        {view === 'list' && lakes.some((lake) => resolve(lake.id).season === 'ice') ? <IceSafetyNotice compact /> : null}
      </View>

      {view === 'map' ? (
        <>
          <View style={{ flex: 1, minHeight: 160 }}>
            <LakeMap pins={pins} selectedId={selectedId} onSelect={setSelectedId} />
          </View>
          <View style={styles.sheet} accessibilityLiveRegion="polite">
            <Row gap={spacing.md} align="center">
              <View style={{ flex: 1, gap: 3 }}>
                <T variant="headline" numberOfLines={1}>{selected.lake.name}</T>
                <Row gap={6}>
                  <Icon name={selected.window ? 'clock' : 'info'} size={13} color={selected.window ? colors.sunriseInk : colors.inkMuted} />
                  <T variant="callout" weight="600" color={selected.window ? colors.ink : colors.inkSoft} numberOfLines={1} style={{ flexShrink: 1 }}>
                    {windowText(selected)}
                  </T>
                </Row>
                <T variant="caption" color={colors.inkMuted} numberOfLines={2}>
                  {seasonLabel(resolve(selected.lake.id).season)}
                  {selected.forecast ? ` · ${(selected.window?.reasons ?? selected.now?.reasons ?? [])[0] ?? 'Mixed conditions'}` : ''}
                </T>
              </View>
              {selected.score === null ? null : <ScoreBadge score={selected.score} size="md" caption={selectedBroad ? 'Block' : selected.window ? 'Peak' : 'Now'} />}
            </Row>
            {selected.now ? <ConfidenceBars level={selected.window?.confidence ?? selected.now.confidence} long /> : null}
            {atLimit ? <T variant="caption" color={colors.inkMuted}>You follow 5 lakes — remove one to follow another.</T> : null}
            <Row gap={spacing.sm}>
              <Button style={{ flex: 1 }} size="md" variant="secondary" icon={isFollowing ? 'check' : 'plus'} disabled={atLimit} onPress={follow}>
                {isFollowing ? 'Following' : 'Follow'}
              </Button>
              <Button style={{ flex: 1.4 }} size="md" iconRight="chevron-right" onPress={() => router.push({ pathname: '/lake/[id]', params: { id: selected.lake.id } })}>
                Forecast
              </Button>
            </Row>
          </View>
        </>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {mode === 'cached' ? <Banner tone="neutral" icon="device" body="Showing every covered lake from data stored on this device." /> : null}
          {[...summaries].sort((a, b) => (b.score ?? -1) - (a.score ?? -1)).map((summary) => {
            const { lake, forecast, window, now, score } = summary;
            const broad = forecast?.predictionGranularity === 'time_block';
            return (
            <Card
              key={lake.id}
              onPress={() => router.push({ pathname: '/lake/[id]', params: { id: lake.id } })}
              accessibilityLabel={`${lake.name}${followed.includes(lake.id) ? ', followed' : ''}. ${windowText(summary)}.${now ? ` ${window ? (broad ? 'Broad block' : 'Peak') : 'Now'} ${score}. ${(window?.reasons ?? now.reasons).slice(0, 2).join(', ')}. ${window?.confidence ?? now.confidence} confidence.` : ''}`}
            >
              <Row gap={spacing.md} align="flex-start">
                <View style={{ flex: 1, gap: 2 }}>
                  <Row gap={spacing.sm}>
                    <T variant="subhead">{lake.name}</T>
                    {followed.includes(lake.id) ? <Icon name="check" size={14} color={colors.teal} /> : null}
                  </Row>
                  <T variant="caption" color={colors.inkMuted}>{windowText(summary)}</T>
                </View>
                {score === null ? null : <ScoreBadge score={score} caption={broad ? 'Block' : window ? 'Peak' : 'Now'} />}
              </Row>
              {now ? (
                <>
                  <ReasonLine reasons={window?.reasons ?? now.reasons} />
                  <ConfidenceBars level={window?.confidence ?? now.confidence} long />
                </>
              ) : null}
            </Card>
            );
          })}
        </ScrollView>
      )}
    </Screen>
  );
}

function windowText({ forecast, window, waiting }: { forecast?: LakeForecast; window?: ForecastWindow; waiting: boolean }) {
  if (!forecast) return waiting ? 'Loading forecast…' : 'No forecast published yet';
  return window ? `${formatDay(window.start)} · ${formatWindow(window)}` : 'No window above 60 in 24 h';
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0, gap: 0, maxWidth: undefined },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.md, gap: spacing.md },
  sheet: { backgroundColor: colors.paper, paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.md + TAB_BUTTON_RISE, gap: spacing.sm + 2, borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: colors.line },
  list: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl + TAB_BUTTON_RISE, gap: spacing.md },
});
