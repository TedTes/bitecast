import type { ForecastHour } from '@bitecast/engine';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import * as SunCalc from 'suncalc';
import { bestWindowWithin, formatWindow, HourlyChart, hoursFromNow, upcomingWindows, windowEnd } from '@/components/forecast';
import { Icon } from '@/components/icon';
import { Shoreline } from '@/components/shoreline-header';
import type { IconName } from '@/components/icon';
import { Button, Card, Divider, EmptyState, ListRow, Reveal, Row, Screen, T } from '@/components/ui';
import { colors, hitSlop, radius, spacing } from '@/constants/theme';
import { freshness, useForecast } from '@/data/forecasts';
import { lakes } from '@/data/lakes';
import { useLakeCondition } from '@/features/lake-season';
import { capitalize, formatDay, formatWind, reasonIcon, reasonLabel, shortClock } from '@/lib/format';
import { useSceneSky } from '@/features/live-sky';
import { onScene } from '@/features/sky';
import { haptic } from '@/lib/haptics';
import { useNow } from '@/lib/use-now';
import { useAppStore } from '@/store/use-app-store';

/*
 * Lake detail keeps current signals in the shoreline header, then a one-line verdict over the
 * hourly graph, the conditions behind it (with sunrise and sunset), and regulations.
 */

export default function LakeForecastScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const lake = lakes.find((item) => item.id === id);
  const condition = useLakeCondition(lake?.id ?? '');
  const season = condition.season;
  const followed = useAppStore((state) => state.followedLakeIds);
  const toggle = useAppStore((state) => state.toggleLake);
  const query = useForecast(lake?.id ?? '', season);
  const now = useNow();
  const sky = useSceneSky(lake ? { lake, season, forecast: query.data } : undefined, now);

  if (!lake) {
    return (
      <Screen>
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
  const stale = query.isRefetchError || fresh.state === 'stale';
  const updated = query.isRefetchError ? 'Saved forecast' : fresh.label;
  const span = Math.min(24, hours.length);
  const live = upcomingWindows(forecast.windows, now).find((w) => new Date(w.start).getTime() <= now);
  const best = bestWindowWithin(forecast.windows, span, now);
  const verdict = live
    ? `Bite window open until ${shortClock(windowEnd(live))}`
    : best
      ? `Best: ${formatDay(best.start)} ${formatWindow(best)}`
      : `No bite window in the next ${span} hours`;

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
      <Icon name={isFollowing ? 'check' : 'plus'} size={13} color={isFollowing ? colors.deep : onScene.text} />
      <T variant="caption" weight="600" color={isFollowing ? colors.deep : onScene.text}>{isFollowing ? 'Following' : 'Follow'}</T>
    </Pressable>
  );

  const headerMeta = (
    <View style={styles.headerMeta}>
      <Row gap={5}>
        <Icon name={stale ? 'warning' : 'clock'} size={12} color={stale ? onScene.accent : onScene.soft} />
        <T variant="caption" color={stale ? onScene.accent : onScene.soft}>{updated}</T>
      </Row>
      <View style={styles.headerReasons}>
        {(current.reasons.length ? current.reasons.slice(0, 2) : ['Mixed conditions']).map((reason) => (
          <Row key={reason} gap={5}>
            <Icon name={reasonIcon(reason)} size={12} color={onScene.accent} />
            <T variant="caption" color={onScene.text}>{reasonLabel(reason)}</T>
          </Row>
        ))}
      </View>
    </View>
  );

  return (
    <Screen
      top={<Shoreline back title={lake.name} subtitle={`${lake.region} · ${capitalize(lake.clarity)} water`} meta={headerMeta} right={follow} sky={sky} />}
      refreshing={query.isRefetching}
      onRefresh={() => query.refetch()}
    >
      <Reveal index={0} style={styles.forecast}>
        <View style={{ gap: 2 }}>
          <T variant="subhead" accessibilityRole="header">{`Next ${span} hours`}</T>
          <T variant="caption" color={colors.inkMuted}>{verdict}</T>
        </View>
        <HourlyChart hours={hours} windows={forecast.windows} nowShownAbove compactReadout />
        <Conditions hours={hours.slice(0, 6)} latitude={lake.latitude} longitude={lake.longitude} now={now} />
      </Reveal>

      <Card style={{ gap: 0, paddingVertical: spacing.xs }}>
        <ListRow icon="document" title="Walleye regulations" subtitle="Season, limits and the official source" onPress={() => router.push({ pathname: '/lake/[id]/regulations', params: { id: lake.id } })} />
      </Card>

    </Screen>
  );
}

/* ───────────── Conditions: weather behind the score, plus the low-light times ───────────── */

const avg = (hours: ForecastHour[], pick: (h: ForecastHour) => number) => hours.reduce((t, h) => t + pick(h), 0) / Math.max(1, hours.length);
const cloudLabel = (pct: number) => (pct < 25 ? 'Clear' : pct < 70 ? 'Part cloud' : 'Overcast');
const pressureTrend = (hours: ForecastHour[]) => {
  if (hours.length < 2) return 'Steady';
  const delta = hours[hours.length - 1].pressureHpa - hours[0].pressureHpa;
  return delta > 1 ? 'Rising' : delta < -1 ? 'Falling' : 'Steady';
};

/** Next sunrise and sunset from now (today's, or tomorrow's once they have passed). */
function sunTimes(latitude: number, longitude: number, now: number) {
  const today = SunCalc.getTimes(new Date(now), latitude, longitude);
  const tomorrow = SunCalc.getTimes(new Date(now + 86_400_000), latitude, longitude);
  const pick = (a: Date | null, b: Date | null) => (a && a.getTime() > now ? a : b);
  return { sunrise: pick(today.sunrise, tomorrow.sunrise), sunset: pick(today.sunset, tomorrow.sunset) };
}

function Conditions({ hours, latitude, longitude, now }: { hours: ForecastHour[]; latitude: number; longitude: number; now: number }) {
  const units = useAppStore((state) => state.settings.units);
  if (!hours.length) return null;
  const wind = hours[0].windKmh;
  const rain = hours.reduce((t, h) => t + h.precipitationMm, 0);
  const cloud = cloudLabel(avg(hours, (h) => h.cloudPct));
  const pressure = pressureTrend(hours);
  const sun = sunTimes(latitude, longitude, now);
  const at = (d: Date | null) => (d ? `${shortClock(d)}${formatDay(d) === 'Today' ? '' : ` ${formatDay(d).toLowerCase()}`}` : '–');
  const sunrise = at(sun.sunrise);
  const sunset = at(sun.sunset);
  return (
    <Card style={{ gap: spacing.sm, paddingVertical: spacing.md }}>
      <T variant="caption" weight="600" color={colors.inkMuted}>Conditions · next 6 h</T>
      <View style={styles.tiles} accessible accessibilityLabel={`Wind ${formatWind(wind, units)}, ${rain < 0.2 ? 'dry' : `${Math.round(rain * 10) / 10} millimetres of rain`}, ${cloud}, pressure ${pressure.toLowerCase()}.`}>
        <Tile icon="wind" label="Wind" value={formatWind(wind, units)} warn={wind >= 25} />
        <Tile icon="rain" label="Rain" value={rain < 0.2 ? 'Dry' : `${Math.round(rain * 10) / 10} mm`} warn={rain >= 2} />
        <Tile icon="cloud" label="Sky" value={cloud} />
        <Tile icon="pressure" label="Pressure" value={pressure} />
      </View>
      <Divider />
      <Row gap={spacing.lg} wrap accessible accessibilityLabel={`Sunrise ${sunrise}, sunset ${sunset}`}>
        <Row gap={5}>
          <Icon name="today" size={13} color={colors.sunrise} />
          <T variant="caption" color={colors.inkMuted}>Sunrise <T variant="caption" weight="600" color={colors.ink}>{sunrise}</T></T>
        </Row>
        <Row gap={5}>
          <Icon name="transition" size={13} color={colors.teal} />
          <T variant="caption" color={colors.inkMuted}>Sunset <T variant="caption" weight="600" color={colors.ink}>{sunset}</T></T>
        </Row>
      </Row>
    </Card>
  );
}

function Tile({ icon, label, value, warn }: { icon: IconName; label: string; value: string; warn?: boolean }) {
  return (
    <View style={styles.tile}>
      <Icon name={icon} size={15} color={warn ? colors.sunriseInk : colors.teal} />
      <T variant="caption" weight="600" color={warn ? colors.sunriseInk : colors.ink} numberOfLines={1}>{value}</T>
      <T variant="caption" color={colors.inkMuted} style={{ fontSize: 11 }} numberOfLines={1}>{label}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  follow: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 36, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: onScene.glassLine, backgroundColor: onScene.glass },
  following: { backgroundColor: colors.onDark, borderColor: colors.onDark },
  headerMeta: { gap: spacing.xs, maxWidth: 520 },
  headerReasons: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.lg, rowGap: 2 },
  forecast: { gap: spacing.md },
  tiles: { flexDirection: 'row', gap: spacing.xs },
  tile: { flex: 1, alignItems: 'center', gap: 1 },
});
