import { useState } from 'react';
import { router } from 'expo-router';
import { useQueries } from '@tanstack/react-query';
import { ScrollView, StyleSheet, View } from 'react-native';
import { ConfidenceMeter, ReasonChips, ScoreReadout, bestWindowWithin, formatWindow } from '@/components/forecast';
import { Icon } from '@/components/icon';
import { LakeMap, useMapMode, type MapLakePin } from '@/components/map/lake-map';
import { Banner, Button, Card, Chip, IceSafetyNotice, Row, Screen, Segmented, T } from '@/components/ui';
import { colors, elevation, radius, spacing } from '@/constants/theme';
import { forecastQuery } from '@/data/forecasts';
import { lakes } from '@/data/lakes';
import { formatDay } from '@/lib/format';
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
  const queries = useQueries({ queries: lakes.map((lake) => forecastQuery(lake.id, resolve(lake.id).season)) });

  const summaries = lakes.map((lake, index) => {
    const forecast = queries[index].data;
    const window = forecast ? bestWindowWithin(forecast.windows, 24) : undefined;
    const now = forecast?.hours[0];
    return { lake, window, now, score: window?.peakScore ?? now?.score ?? 0 };
  });
  const pins: MapLakePin[] = summaries.map(({ lake, score }) => ({
    id: lake.id, name: lake.name, latitude: lake.latitude, longitude: lake.longitude, score,
    followed: followed.includes(lake.id), scale: lake.region === 'Great Lakes' ? 'large' : 'small',
  }));
  const selected = summaries.find((item) => item.lake.id === selectedId) ?? summaries[0];
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
            <Row gap={spacing.md} align="flex-start">
              <View style={{ flex: 1, gap: 2 }}>
                <T variant="headline">{selected.lake.name}</T>
                <T variant="caption" color={colors.inkMuted}>{selected.lake.region} · {seasonLabel(resolve(selected.lake.id).season)}</T>
                <Row gap={6} style={{ marginTop: spacing.xs }}>
                  <Icon name={selected.window ? 'clock' : 'info'} size={14} color={selected.window ? colors.sunriseInk : colors.inkMuted} />
                  <T variant="callout" weight="700" color={selected.window ? colors.ink : colors.inkSoft}>
                    {selected.window ? `${formatDay(selected.window.start)} · ${formatWindow(selected.window)}` : 'No window above 60 in 24 h'}
                  </T>
                </Row>
              </View>
              <ScoreReadout score={selected.score} caption={selected.window ? 'Peak' : 'Now'} />
            </Row>
            <ReasonChips reasons={selected.window?.reasons ?? selected.now?.reasons ?? []} limit={2} />
            <ConfidenceMeter value={selected.window?.confidence ?? selected.now?.confidence ?? 'Low'} />
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
          {[...summaries].sort((a, b) => b.score - a.score).map(({ lake, window, now, score }) => (
            <Card
              key={lake.id}
              onPress={() => router.push({ pathname: '/lake/[id]', params: { id: lake.id } })}
              accessibilityLabel={`${lake.name}${followed.includes(lake.id) ? ', followed' : ''}. ${window ? `${formatDay(window.start)} ${formatWindow(window)}, peak ${score}` : `Now ${score}, no window in 24 hours`}. ${(window?.reasons ?? now?.reasons ?? []).slice(0, 2).join(', ')}. ${window?.confidence ?? now?.confidence} confidence.`}
            >
              <Row gap={spacing.md} align="flex-start">
                <View style={{ flex: 1, gap: 2 }}>
                  <Row gap={spacing.sm}>
                    <T variant="subhead">{lake.name}</T>
                    {followed.includes(lake.id) ? <Icon name="check" size={14} color={colors.teal} /> : null}
                  </Row>
                  <T variant="caption" color={colors.inkMuted}>{window ? `${formatDay(window.start)} · ${formatWindow(window)}` : 'No window above 60 in 24 h'}</T>
                </View>
                <ScoreReadout score={score} size="sm" />
              </Row>
              <ReasonChips reasons={window?.reasons ?? now?.reasons ?? []} limit={2} />
              <ConfidenceMeter value={window?.confidence ?? now?.confidence ?? 'Low'} />
            </Card>
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0, gap: 0, maxWidth: undefined },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.md, gap: spacing.md },
  sheet: { backgroundColor: colors.paper, paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.lg, gap: spacing.md, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, marginTop: -spacing.lg, ...elevation.raised },
  list: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.md },
});
