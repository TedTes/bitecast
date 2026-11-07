import { router, useLocalSearchParams } from 'expo-router';
import { walleyeProfile } from '@bitecast/engine';
import { View } from 'react-native';
import { ConfidenceMeter, LightCurve, ReasonList, ScoreReadout, formatWindow, windowEnd, windowPeak } from '@/components/forecast';
import { Icon, type IconName } from '@/components/icon';
import { Button, Card, Chip, Divider, EmptyState, IceSafetyNotice, Row, Screen, SectionHeader, T } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { useForecast } from '@/data/forecasts';
import { lakeById } from '@/data/lakes';
import { capitalize, durationLabel, formatDay, formatHour, formatWind } from '@/lib/format';
import { useAppStore } from '@/store/use-app-store';

type Contributor = { icon: IconName; name: string; role: 'Primary' | 'Supporting' | 'Minor'; weight: number; observed: string };

export default function WindowDetailScreen() {
  const { id = '', start = '' } = useLocalSearchParams<{ id: string; start: string }>();
  const season = useAppStore((state) => state.settings.season);
  const units = useAppStore((state) => state.settings.units);
  const lake = lakeById(id);
  const { data: forecast } = useForecast(lake.id, season);
  const window = forecast.windows.find((item) => item.start === start);

  if (!window) {
    return (
      <Screen header>
        <EmptyState
          icon="clock"
          title="This window has moved"
          body="The forecast refreshed since this link was created, so the window may have shifted or passed."
          action={<Button onPress={() => router.replace({ pathname: '/lake/[id]', params: { id: lake.id } })}>See current windows</Button>}
        />
      </Screen>
    );
  }

  const band = walleyeProfile.idealLightBand[lake.clarity];
  const inBand = window.hours.filter((hour) => hour.light >= band[0] && hour.light <= band[1]).length;
  const fastest = [...window.hours].sort((a, b) => b.transition - a.transition)[0];
  const hours = window.hours;
  const avg = (pick: (hour: (typeof hours)[number]) => number) => hours.reduce((sum, hour) => sum + pick(hour), 0) / hours.length;
  const afterDark = window.hours.some((hour) => hour.sunElevation <= -6);
  const pressureStable = window.reasons.includes('Stable pressure');

  const contributors: Contributor[] = [
    { icon: 'low-light', name: 'Underwater light', role: 'Primary', weight: 0.65, observed: `${inBand} of ${window.hours.length} h inside the comfort band for ${lake.clarity} water` },
    { icon: 'transition', name: 'Light transition', role: 'Supporting', weight: walleyeProfile.transitionWeight, observed: fastest.transition > 0.35 ? `Fastest change near ${formatHour(fastest.ts)}` : 'Light is changing gradually' },
    { icon: 'pressure', name: 'Barometric pressure', role: 'Minor', weight: walleyeProfile.pressureWeight, observed: pressureStable ? 'Stable or falling' : 'Rising slightly' },
    { icon: 'moon', name: 'Moonlight', role: 'Minor', weight: walleyeProfile.moonWeight, observed: afterDark ? `${Math.round(window.hours[0].moonIllumination * 100)}% illuminated after dark` : 'Not a factor in daylight' },
  ];

  return (
    <Screen
      header
      footer={<Button icon="plus" onPress={() => router.push({ pathname: '/log/new', params: { lakeId: lake.id, score: String(window.peakScore) } })}>Log a trip in this window</Button>}
    >
      <View style={{ gap: spacing.xs }}>
        <T variant="label" color={colors.teal}>{lake.name} · {formatDay(window.start)}</T>
        <Row gap={spacing.md} align="flex-start">
          <View style={{ flex: 1, gap: spacing.xs }}>
            <T variant="display" accessibilityRole="header">{formatWindow(window)}</T>
            <T variant="callout" color={colors.inkMuted}>{durationLabel(window.start, windowEnd(window))} · peaks near {formatHour(windowPeak(window).ts)}</T>
          </View>
          <ScoreReadout score={window.peakScore} size="lg" caption="Peak" />
        </Row>
      </View>

      <Card variant="tint" style={{ gap: spacing.sm }}>
        <ConfidenceMeter value={window.confidence} explain />
        <Divider color={colors.tealTint} />
        <T variant="callout" color={colors.inkSoft}>
          Underwater light moves into the range walleye tend to feed in. That makes conditions favourable — it doesn’t mean fish will bite.
        </T>
      </Card>

      {season === 'ice' ? <IceSafetyNotice compact /> : null}

      <SectionHeader title="Light through the window" caption="Effective underwater light each hour, with bite score above" />
      <Card>
        <LightCurve hours={window.hours} band={band} />
      </Card>

      <SectionHeader title="What’s driving the score" caption="Light matters most; pressure and moon only nudge it" />
      <Card style={{ gap: spacing.lg }}>
        {contributors.map((item) => (
          <View key={item.name} style={{ gap: spacing.sm }} accessible accessibilityLabel={`${item.name}, ${item.role.toLowerCase()} factor, about ${Math.round(item.weight * 100)} percent of the score. ${item.observed}.`}>
            <Row gap={spacing.md}>
              <Icon name={item.icon} size={18} color={colors.teal} />
              <T variant="subhead" style={{ flex: 1 }}>{item.name}</T>
              <Chip label={item.role} tone={item.role === 'Primary' ? 'teal' : item.role === 'Supporting' ? 'neutral' : 'outline'} />
            </Row>
            <View style={{ height: 6, borderRadius: radius.pill, backgroundColor: colors.fog, overflow: 'hidden' }}>
              <View style={{ width: `${item.weight * 100}%`, height: '100%', backgroundColor: item.role === 'Primary' ? colors.teal : colors.inkFaint }} />
            </View>
            <T variant="caption" color={colors.inkMuted}>{item.observed}</T>
          </View>
        ))}
        <Divider />
        <Row justify="space-between" wrap gap={spacing.md}>
          <Stat label="Cloud cover" value={`${Math.round(avg((h) => h.cloudPct))}%`} />
          <Stat label="Wind" value={season === 'ice' ? 'n/a under ice' : formatWind(avg((h) => h.windKmh), units)} />
          <Stat label="Pressure" value={`${Math.round(avg((h) => h.pressureHpa))} hPa`} />
        </Row>
      </Card>

      <SectionHeader title="Why this window" />
      <Card>
        <ReasonList reasons={window.reasons} />
      </Card>

      <SectionHeader title="Tactics to try" />
      <Card style={{ gap: spacing.md }}>
        <Chip label={`${capitalize(window.depth)} water`} tone="dark" icon="depth" />
        <T variant="headline">{window.tactics}</T>
        <T variant="callout" color={colors.inkMuted}>
          A starting point from the walleye profile for this light level — not a spot prediction. Adjust to what you see on the water.
        </T>
      </Card>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ minWidth: 88 }}>
      <T variant="caption" color={colors.inkMuted}>{label}</T>
      <T variant="numeralS">{value}</T>
    </View>
  );
}
