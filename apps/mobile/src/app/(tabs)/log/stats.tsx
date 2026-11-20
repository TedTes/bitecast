import { router } from 'expo-router';
import { View } from 'react-native';
import { Icon } from '@/components/icon';
import { Button, Card, Divider, ProgressBar, Row, Screen, SectionHeader, SkeletonCard, T } from '@/components/ui';
import { WalleyeArt } from '@/components/walleye';
import { colors, radius, spacing } from '@/constants/theme';
import { byBait, byLight, byTimeOfDay, summary, type Bucket } from '@/features/stats';
import { useAppStore } from '@/store/use-app-store';

const MIN_LOGS = 5;
const pct = (value: number) => `${Math.round(value * 100)}%`;

export default function StatsScreen() {
  const logs = useAppStore((state) => state.catchLogs);
  const hydrated = useAppStore((state) => state.hydrated);

  if (!hydrated) {
    return (
      <Screen header tab>
        <SkeletonCard />
        <SkeletonCard />
      </Screen>
    );
  }

  if (logs.length < MIN_LOGS) {
    const remaining = MIN_LOGS - logs.length;
    return (
      <Screen header tab footer={<Button icon="plus" onPress={() => router.push('/log/new')}>Log a trip</Button>}>
        <View style={{ gap: spacing.xs }}>
          <T variant="label" color={colors.teal}>Personal insights</T>
          <T variant="title" accessibilityRole="header">Your patterns</T>
        </View>
        <View style={{ alignItems: 'center' }} importantForAccessibility="no-hide-descendants">
          <WalleyeArt width={220} tone="light" />
        </View>
        <Card style={{ gap: spacing.md }}>
          <Row justify="space-between" align="flex-end">
            <T variant="headline">{remaining} more log{remaining === 1 ? '' : 's'} to go</T>
            <T variant="numeralS" color={colors.inkMuted}>{logs.length}/{MIN_LOGS}</T>
          </Row>
          <ProgressBar value={logs.length / MIN_LOGS} label={`${logs.length} of ${MIN_LOGS} logs`} height={10} />
          <T variant="callout" color={colors.inkSoft}>Five trips is the minimum before patterns mean anything. No-catch trips count — they show when fishing was slow.</T>
        </Card>
        <SectionHeader title="What you’ll unlock" />
        <Card style={{ gap: spacing.md }}>
          {[
            { icon: 'clock' as const, title: 'Best time of day', body: 'Your catch rate at dawn, dusk and in between.' },
            { icon: 'lure' as const, title: 'Top baits and lures', body: 'Which presentations actually produced fish.' },
            { icon: 'low-light' as const, title: 'Catch rate by light', body: 'How you do in low, mid and bright light.' },
          ].map((item) => (
            <Row key={item.title} gap={spacing.md} align="flex-start">
              <View style={{ width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.tealMist, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={item.icon} size={18} color={colors.teal} />
              </View>
              <View style={{ flex: 1 }}>
                <T variant="subhead">{item.title}</T>
                <T variant="callout" color={colors.inkSoft}>{item.body}</T>
              </View>
            </Row>
          ))}
        </Card>
        <T variant="caption" color={colors.inkMuted} align="center">Stats are calculated on this device, including logs that haven’t synced.</T>
      </Screen>
    );
  }

  const totals = summary(logs);
  const periods = byTimeOfDay(logs);
  const light = byLight(logs);
  const baits = byBait(logs);

  return (
    <Screen header tab>
      <View style={{ gap: spacing.xs }}>
        <T variant="label" color={colors.teal}>Personal insights · {logs.length} trips</T>
        <T variant="title" accessibilityRole="header">Your patterns</T>
      </View>

      <Row gap={spacing.md} align="stretch">
        <Metric value={pct(totals.rate)} label="of trips caught fish" />
        <Metric value={String(totals.fish)} label="walleye logged" />
      </Row>

      {totals.bestPeriod || totals.bestLight ? (
        <Card variant="ink" style={{ gap: spacing.sm }}>
          <T variant="label" color={colors.sunrise}>Your strongest pattern so far</T>
          <T variant="headline" color={colors.onDark}>
            {[totals.bestPeriod && `${totals.bestPeriod.label}`, totals.bestLight && totals.bestLight.label.toLowerCase()].filter(Boolean).join(' in ')}
          </T>
          <T variant="callout" color={colors.onDarkMuted}>
            Based on your own logs. A pattern from a handful of trips is a hint, not a rule.
          </T>
        </Card>
      ) : null}

      <SectionHeader title="Best time of day" caption="Share of trips with at least one walleye" />
      <Card style={{ gap: spacing.md }}>
        {periods.map((item) => <RateRow key={item.key} item={item} hint={item.hint} />)}
      </Card>

      <SectionHeader title="Catch rate by light" caption="Light at the time of each log" />
      <Card style={{ gap: spacing.md }}>
        {light.map((item) => <RateRow key={item.key} item={item} />)}
      </Card>

      <SectionHeader title="Top baits and lures" caption="Ranked by walleye logged" />
      <Card style={{ gap: 0, paddingVertical: spacing.xs }}>
        {baits.map((item, index) => (
          <View key={item.key}>
            {index > 0 ? <Divider /> : null}
            <Row gap={spacing.md} style={{ minHeight: 56, paddingVertical: spacing.sm }} accessible accessibilityLabel={`${index + 1}. ${item.label}: ${item.fish} walleye over ${item.trips} trips, ${pct(item.rate)} success`}>
              <T variant="numeralS" color={colors.inkMuted} style={{ width: 20 }}>{index + 1}</T>
              <View style={{ flex: 1 }}>
                <T variant="subhead" numberOfLines={1}>{item.label}</T>
                <T variant="caption" color={colors.inkMuted}>{item.trips} trip{item.trips === 1 ? '' : 's'} · {pct(item.rate)} with fish</T>
              </View>
              <T variant="numeralM">{item.fish}</T>
            </Row>
          </View>
        ))}
      </Card>

      <T variant="caption" color={colors.inkMuted} align="center">Calculated on this device from all {logs.length} logs, including unsynced ones.</T>
    </Screen>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <Card style={{ flex: 1, gap: 2 }}>
      <T variant="numeralL" color={colors.teal}>{value}</T>
      <T variant="caption" color={colors.inkMuted}>{label}</T>
    </Card>
  );
}

function RateRow({ item, hint }: { item: Bucket; hint?: string }) {
  const thin = item.trips > 0 && item.trips < 2;
  return (
    <View style={{ gap: 6 }} accessible accessibilityLabel={`${item.label}${hint ? `, ${hint}` : ''}: ${item.trips ? `${pct(item.rate)} of ${item.trips} trips` : 'no trips yet'}${thin ? ', too few trips to rely on' : ''}`}>
      <Row justify="space-between">
        <T variant="callout" weight="700">{item.label}{hint ? <T variant="caption" color={colors.inkMuted}>  {hint}</T> : null}</T>
        <T variant="callout" weight="700" color={item.trips ? colors.ink : colors.inkFaint}>{item.trips ? pct(item.rate) : '—'}</T>
      </Row>
      <ProgressBar value={item.rate} color={thin ? colors.inkFaint : colors.teal} />
      <T variant="caption" color={colors.inkMuted}>{item.trips ? `${item.successes} of ${item.trips} trips${thin ? ' · too few to rely on' : ''}` : 'No trips logged yet'}</T>
    </View>
  );
}
