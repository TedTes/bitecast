import { useState } from 'react';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Icon } from '@/components/icon';
import { Banner, Button, Card, ChoiceChips, EmptyState, IconButton, ProgressBar, Reveal, Row, Screen, SectionHeader, SkeletonCard, T } from '@/components/ui';
import { WalleyeArt } from '@/components/walleye';
import { colors, radius, scoreBand, scoreBands, spacing } from '@/constants/theme';
import { integrationsReady } from '@/api/config';
import { lakeById } from '@/data/lakes';
import { capitalize, formatDay, formatTime, lengthUnit, startOfDay, toDisplayLength } from '@/lib/format';
import { useNow } from '@/lib/use-now';
import { useAppStore } from '@/store/use-app-store';
import type { CatchLog } from '@/types/app';

type Filter = 'all' | 'caught' | 'none' | 'pending';
const STATS_MIN = 5;

export default function LogListScreen() {
  const logs = useAppStore((state) => state.catchLogs);
  const hydrated = useAppStore((state) => state.hydrated);
  const lastSaved = useAppStore((state) => state.lastSaved);
  const units = useAppStore((state) => state.settings.units);
  const syncPending = useAppStore((state) => state.syncPending);
  const [filter, setFilter] = useState<Filter>('all');
  const [syncing, setSyncing] = useState(false);
  const now = useNow(15_000);

  const pending = logs.filter((log) => log.syncState === 'pending').length;
  const failed = logs.filter((log) => log.syncState === 'error').length;
  const filtered = logs.filter((log) => filter === 'all' || (filter === 'caught' ? log.caught : filter === 'none' ? !log.caught : log.syncState !== 'synced'));
  const groups = filtered.reduce<{ key: string; label: string; items: CatchLog[] }[]>((acc, log) => {
    const key = startOfDay(new Date(log.caughtAt)).toISOString();
    const group = acc.find((item) => item.key === key);
    if (group) group.items.push(log);
    else acc.push({ key, label: formatDay(log.caughtAt), items: [log] });
    return acc;
  }, []);
  const last = logs[0];
  const recent = lastSaved && now - lastSaved.at < 60_000 ? lastSaved.id : null;

  const retrySync = async () => {
    setSyncing(true);
    await syncPending().catch(() => undefined);
    setSyncing(false);
  };

  return (
    <Screen tab>
      <Row gap={spacing.md} align="flex-end">
        <View style={{ flex: 1, gap: spacing.xs }}>
          <T variant="label" color={colors.teal}>Your field notes</T>
          <T variant="display" accessibilityRole="header">Catch log</T>
        </View>
        <IconButton icon="plus" label="Log a trip" tone="ink" size={48} onPress={() => router.push('/log/new')} />
      </Row>

      <Card variant="tint" style={{ gap: spacing.md }}>
        <View style={{ gap: 2 }}>
          <T variant="subhead">Log while it’s fresh</T>
          <T variant="callout" color={colors.inkSoft}>
            {last ? `Starts with ${lakeById(last.lakeId).name} · ${last.bait || 'your last bait'} · ${last.method}.` : 'Takes about 15 seconds. Works with no signal.'}
          </T>
        </View>
        <Button icon="plus" onPress={() => router.push('/log/new')}>Log a trip</Button>
      </Card>

      {failed ? (
        <Banner tone="danger" icon="sync-error" title={`${failed} log${failed > 1 ? 's' : ''} didn’t sync`} body="They’re safe on this device. We’ll retry automatically." action={{ label: 'Retry now', onPress: retrySync, loading: syncing }} />
      ) : pending ? (
        <Banner
          tone="neutral"
          icon="device"
          title={`${pending} log${pending > 1 ? 's' : ''} saved on this device`}
          body={integrationsReady ? 'They’ll sync automatically when you’re back online.' : 'Cloud sync turns on once an account service is connected. Your logs stay on this device until then.'}
        />
      ) : null}

      <Card onPress={() => router.push('/(tabs)/log/stats')} accessibilityLabel={logs.length >= STATS_MIN ? 'Your patterns. View best hours, lures and light conditions.' : `Your patterns. ${logs.length} of ${STATS_MIN} logs needed.`}>
        <Row gap={spacing.md}>
          <View style={styles.statsIcon}><Icon name="chart" size={18} color={colors.teal} /></View>
          <View style={{ flex: 1, gap: 2 }}>
            <T variant="subhead">Your patterns</T>
            <T variant="caption" color={colors.inkMuted}>{logs.length >= STATS_MIN ? 'Best hours, lures and light conditions' : `${logs.length} of ${STATS_MIN} logs to unlock`}</T>
          </View>
          <Icon name="chevron-right" size={16} color={colors.inkFaint} />
        </Row>
        {logs.length < STATS_MIN ? <ProgressBar value={logs.length / STATS_MIN} label="Progress to personal stats" /> : null}
      </Card>

      {!hydrated ? (
        <>
          <SkeletonCard />
          <SkeletonCard />
        </>
      ) : logs.length === 0 ? (
        <EmptyState
          icon="log"
          art={<WalleyeArt width={200} tone="light" />}
          title="Build your pattern"
          body="Log your first trip — even a no-catch trip helps show which windows work for you."
        />
      ) : (
        <>
          <SectionHeader title="History" caption={`${logs.length} trip${logs.length === 1 ? '' : 's'}`} />
          <ChoiceChips<Filter>
            label="Filter logs"
            value={filter}
            onChange={setFilter}
            options={[
              { label: 'All', value: 'all' },
              { label: 'Caught', value: 'caught' },
              { label: 'No catch', value: 'none' },
              { label: 'Not synced', value: 'pending' },
            ]}
          />
          {groups.length === 0 ? (
            <EmptyState icon="filter" title="No logs match" body="Try a different filter." action={<Button variant="secondary" onPress={() => setFilter('all')}>Show all logs</Button>} />
          ) : (
            groups.map((group) => (
              <View key={group.key} style={{ gap: spacing.sm }}>
                <T variant="label" color={colors.inkMuted} accessibilityRole="header">{group.label}</T>
                {group.items.map((log, index) => (
                  <Reveal key={log.id} index={index}>
                    <LogRow log={log} justSaved={log.id === recent} units={units} />
                  </Reveal>
                ))}
              </View>
            ))
          )}
        </>
      )}
    </Screen>
  );
}

function LogRow({ log, justSaved, units }: { log: CatchLog; justSaved: boolean; units: 'metric' | 'imperial' }) {
  const lake = lakeById(log.lakeId);
  const band = scoreBands[scoreBand(log.scoreAtTime)];
  const sync = log.syncState === 'synced'
    ? { icon: 'sync-done' as const, text: 'Synced', color: colors.success }
    : log.syncState === 'error'
      ? { icon: 'sync-error' as const, text: 'Sync failed · will retry', color: colors.danger }
      : { icon: 'device' as const, text: 'On this device', color: colors.inkMuted };
  const result = log.caught ? `${log.count} walleye` : 'No catch';
  return (
    <Card
      onPress={() => router.push({ pathname: '/log/[id]', params: { id: log.id } })}
      accessibilityLabel={`${lake.name}, ${formatTime(log.caughtAt)}. ${result}. ${log.method}, ${log.bait || 'no bait noted'}. Bite score ${log.scoreAtTime} at the time. ${sync.text}.${justSaved ? ' Just saved.' : ''}`}
      accessibilityHint="Edit this log"
      style={justSaved ? { borderColor: colors.teal, borderWidth: 1.5 } : undefined}
    >
      <Row gap={spacing.md} align="flex-start">
        <View style={[styles.result, { backgroundColor: log.caught ? colors.successTint : colors.fog }]}>
          <T variant="numeralM" color={log.caught ? colors.success : colors.inkMuted}>{log.caught ? log.count : '0'}</T>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Row justify="space-between">
            <T variant="subhead" style={{ flex: 1 }} numberOfLines={1}>{lake.name}</T>
            <T variant="caption" color={colors.inkMuted}>{formatTime(log.caughtAt)}</T>
          </Row>
          <T variant="callout" color={colors.inkSoft} numberOfLines={1}>
            {result}{log.lengthCm ? ` · biggest ${toDisplayLength(log.lengthCm, units)} ${lengthUnit(units)}` : ''} · {capitalize(log.method)} · {log.bait || 'No bait noted'}
          </T>
          <Row gap={spacing.md} style={{ marginTop: 4 }} wrap>
            <Row gap={4}>
              <View style={[styles.bandDot, { backgroundColor: band.color }]} />
              <T variant="caption" color={colors.inkSoft}>Score {log.scoreAtTime} · {log.lightCondition}</T>
            </Row>
            <Row gap={4}>
              <Icon name={sync.icon} size={13} color={sync.color} />
              <T variant="caption" color={sync.color}>{sync.text}</T>
            </Row>
          </Row>
        </View>
      </Row>
      {justSaved ? (
        <Row gap={6} style={styles.saved} accessibilityLiveRegion="polite">
          <Icon name="success" size={14} color={colors.success} />
          <T variant="caption" weight="700" color={colors.success}>Saved to this device</T>
        </Row>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  statsIcon: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.tealMist, alignItems: 'center', justifyContent: 'center' },
  result: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  bandDot: { width: 8, height: 8, borderRadius: 4 },
  saved: { paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.line },
});
