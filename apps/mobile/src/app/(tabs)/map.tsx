import { useCallback, useEffect, useState } from 'react';
import { router, useFocusEffect, useNavigation } from 'expo-router';
import { useQueries } from '@tanstack/react-query';
import type { ForecastWindow, LakeForecast } from '@bitecast/engine';
import { BackHandler, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ReasonLine, bestWindowWithin, formatWindow, hoursFromNow } from '@/components/forecast';
import { Icon } from '@/components/icon';
import { ConfidenceBars, ScoreBadge } from '@/components/score-badge';
import { LakeMap, useMapMode, type MapLakePin } from '@/components/map/lake-map';
import { ShorelineHeader } from '@/components/shoreline-header';
import { Banner, Button, Card, IceSafetyNotice, Row, Screen, T } from '@/components/ui';
import { colors, spacing, TAB_BUTTON_RISE, touch } from '@/constants/theme';
import { integrationsReady } from '@/api/config';
import { forecastQuery } from '@/data/forecasts';
import { lakes } from '@/data/lakes';
import { formatDay } from '@/lib/format';
import { useNow } from '@/lib/use-now';
import { publishedForecast } from '@/features/published-forecast';
import { onScene } from '@/features/sky';
import { haptic } from '@/lib/haptics';
import { seasonLabel, useConditionResolver } from '@/features/lake-season';
import { useAppStore } from '@/store/use-app-store';

export default function MapScreen() {
  const followed = useAppStore((state) => state.followedLakeIds);
  const resolve = useConditionResolver();
  const toggle = useAppStore((state) => state.toggleLake);
  const [view, setView] = useState<'map' | 'list'>('map');
  const [selectedId, setSelectedId] = useState<string>(followed[0] ?? lakes[0].id);
  const navigation = useNavigation();
  // The Map tab always means the map, so tapping it closes the list.
  useEffect(() => navigation.addListener('tabPress' as never, () => setView('map')), [navigation]);
  // The list is a layer over the map: Android’s Back closes it before leaving the tab.
  useFocusEffect(
    useCallback(() => {
      if (view !== 'list') return;
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        setView('map');
        return true;
      });
      return () => subscription.remove();
    }, [view]),
  );
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

  const iceNotice = view === 'map' ? resolve(selected.lake.id).season === 'ice' : lakes.some((lake) => resolve(lake.id).season === 'ice');

  const follow = () => {
    if (atLimit) { haptic.warning(); return; }
    haptic.select();
    toggle(selected.lake.id);
  };

  return (
    <Screen
      tab
      scroll={false}
      style={styles.screen}
      top={
        <ShorelineHeader
          page={view === 'map' && !iceNotice ? null : undefined}
          // The tab already says “Map”, so the header says what you’re looking at.
          title={view === 'list' ? 'The lake lineup' : 'Walleye waters'}
          subtitle={
            view === 'list'
              ? `${lakes.length} Ontario lakes · best in the next 24 hours`
              : mode === 'cached'
                ? 'Offline chart · not to scale · not for navigation'
                : `${lakes.length} Ontario lakes · ${followed.length} followed · not for navigation`
          }
          right={
            <Pressable
              onPress={() => {
                haptic.select();
                setView(view === 'map' ? 'list' : 'map');
              }}
              accessibilityRole="button"
              accessibilityLabel={view === 'map' ? 'Show lakes as a list' : 'Close the list and show the map'}
              style={({ pressed }) => [styles.listButton, pressed && { opacity: 0.7 }]}
            >
              <Icon name={view === 'map' ? 'list' : 'close'} size={18} color={onScene.text} />
            </Pressable>
          }
        />
      }
    >
      {iceNotice ? (
        <View style={styles.notice}>
          <IceSafetyNotice compact />
        </View>
      ) : null}

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
  if (!forecast) return waiting ? 'Loading forecast…' : 'No live forecast available';
  return window ? `${formatDay(window.start)} · ${formatWindow(window)}` : 'No window above 60 in 24 h';
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0, gap: 0, maxWidth: undefined },
  // The same glass circle as Back on lake detail.
  listButton: { width: touch.min, height: touch.min, borderRadius: touch.min / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: onScene.glass, borderWidth: 1, borderColor: onScene.glassLine },
  notice: { paddingHorizontal: spacing.xl, paddingVertical: spacing.sm },
  sheet: { backgroundColor: colors.paper, paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.md + TAB_BUTTON_RISE, gap: spacing.sm + 2, borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: colors.line },
  list: { paddingTop: spacing.lg, paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl + TAB_BUTTON_RISE, gap: spacing.md },
});
