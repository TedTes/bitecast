import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon } from '@/components/icon';
import { Banner, Button, EmptyState, ProgressBar, Reveal, Row, Screen, Segmented, SkeletonCard, T } from '@/components/ui';
import { WalleyeArt } from '@/components/walleye';
import { colors, elevation, hitSlop, radius, scoreBand, scoreBands, spacing } from '@/constants/theme';
import { integrationsReady } from '@/api/config';
import { lakeById } from '@/data/lakes';
import { capitalize, formatDay, formatDayInline, formatTime, lengthUnit, startOfDay, toDisplayLength } from '@/lib/format';
import { useNow } from '@/lib/use-now';
import { useAppStore } from '@/store/use-app-store';
import type { CatchLog } from '@/types/app';

/*
 * A field journal: your trips are the content. Logging itself lives on the centre “+”
 * tab button, so this screen has no big action blocks — just a summary, a compact filter
 * and a day-by-day timeline.
 */

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
  const recent = lastSaved && now - lastSaved.at < 60_000 ? lastSaved.id : null;
  const fish = logs.reduce((total, log) => total + (log.caught ? log.count : 0), 0);
  const caughtTrips = logs.filter((log) => log.caught).length;
  const rate = logs.length ? Math.round((caughtTrips / logs.length) * 100) : 0;

  const retrySync = async () => {
    setSyncing(true);
    await syncPending().catch(() => undefined);
    setSyncing(false);
  };

  return (
    <Screen tab>
      <View style={{ gap: 2 }}>
        <T variant="label" color={colors.teal}>Your field notes</T>
        <T variant="title" accessibilityRole="header">Catch log</T>
        {logs.length ? (
          <T variant="caption" color={colors.inkMuted}>
            {logs.length} trip{logs.length === 1 ? '' : 's'} · last {formatDayInline(logs[0].caughtAt)}
          </T>
        ) : null}
      </View>

      {!hydrated ? (
        <>
          <SkeletonCard lines={2} />
          <SkeletonCard />
        </>
      ) : logs.length === 0 ? (
        <EmptyState
          icon="log"
          art={<WalleyeArt width={200} tone="light" />}
          title="Build your pattern"
          body="Tap ＋ below to log your first trip. Even a no-catch trip helps show which windows work for you."
        />
      ) : (
        <>
          {/* Summary: three figures + the patterns unlock in one quiet card */}
          <View style={styles.summary}>
            <Row>
              <Stat value={String(logs.length)} label={logs.length === 1 ? 'Trip' : 'Trips'} />
              <View style={styles.statDivider} />
              <Stat value={String(fish)} label="Walleye" />
              <View style={styles.statDivider} />
              <Stat value={`${rate}%`} label="Trips with fish" />
            </Row>
            <Pressable
              onPress={() => router.push('/(tabs)/log/stats')}
              hitSlop={hitSlop}
              accessibilityRole="button"
              accessibilityLabel={logs.length >= STATS_MIN ? 'Your patterns: best hours, lures and light conditions' : `Your patterns unlock at ${STATS_MIN} logs. ${logs.length} logged.`}
              style={({ pressed }) => [styles.patterns, pressed && { opacity: 0.7 }]}
            >
              <Row gap={spacing.sm}>
                <Icon name="chart" size={14} color={colors.teal} />
                <T variant="caption" weight="700" color={colors.teal} style={{ flex: 1 }}>
                  {logs.length >= STATS_MIN ? 'Your patterns' : `Patterns unlock at ${STATS_MIN} logs · ${logs.length}/${STATS_MIN}`}
                </T>
                <Icon name="chevron-right" size={13} color={colors.teal} />
              </Row>
              {logs.length < STATS_MIN ? <ProgressBar value={logs.length / STATS_MIN} label="Progress to personal patterns" height={4} /> : null}
            </Pressable>
          </View>

          {failed ? (
            <Banner tone="danger" icon="sync-error" title={`${failed} log${failed > 1 ? 's' : ''} didn’t sync`} body="They’re safe on this device. We’ll retry automatically." action={{ label: 'Retry now', onPress: retrySync, loading: syncing }} />
          ) : pending ? (
            <Row gap={6}>
              <Icon name="device" size={13} color={colors.inkMuted} />
              <T variant="caption" color={colors.inkMuted} style={{ flex: 1 }}>
                {pending} log{pending > 1 ? 's' : ''} on this device · {integrationsReady ? 'syncs when you’re online' : 'cloud sync not connected yet'}
              </T>
            </Row>
          ) : null}

          <Segmented<Filter>
            label="Filter logs"
            value={filter}
            onChange={setFilter}
            options={[
              { label: 'All', value: 'all' },
              { label: 'Caught', value: 'caught' },
              { label: 'No catch', value: 'none' },
              { label: 'Unsynced', value: 'pending', accessibilityLabel: 'Not synced' },
            ]}
          />

          {groups.length === 0 ? (
            <EmptyState icon="filter" title="No logs match" body="Try a different filter." action={<Button variant="secondary" size="md" onPress={() => setFilter('all')}>Show all logs</Button>} />
          ) : (
            <View>
              {groups.map((group) => (
                <View key={group.key}>
                  <Row gap={spacing.md} style={styles.dayRow}>
                    <View style={styles.rail}><View style={styles.railLine} /><View style={styles.dayDot} /></View>
                    <T variant="label" color={colors.inkMuted} accessibilityRole="header">{group.label}</T>
                  </Row>
                  {group.items.map((log, index) => (
                    <Reveal key={log.id} index={index}>
                      <Entry log={log} justSaved={log.id === recent} units={units} />
                    </Reveal>
                  ))}
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </Screen>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 1 }} accessible accessibilityLabel={`${value} ${label}`}>
      <T variant="numeralM">{value}</T>
      <T variant="caption" color={colors.inkMuted} style={{ fontSize: 11 }} numberOfLines={1}>{label}</T>
    </View>
  );
}

/** One trip on the timeline: catch badge → lake + time → what you used → conditions then. */
function Entry({ log, justSaved, units }: { log: CatchLog; justSaved: boolean; units: 'metric' | 'imperial' }) {
  const lake = lakeById(log.lakeId);
  const band = scoreBands[scoreBand(log.scoreAtTime)];
  const unsynced = log.syncState !== 'synced';
  const syncText = log.syncState === 'error' ? 'Sync failed · will retry' : log.syncState === 'pending' ? 'On this device' : 'Synced';
  const result = log.caught ? `${log.count} walleye` : 'No catch';
  return (
    <Row gap={spacing.md} align="stretch">
      <View style={styles.rail}>
        <View style={styles.railLine} />
        <View style={[styles.entryDot, log.caught ? styles.entryDotCaught : styles.entryDotNone]} />
      </View>
      <Pressable
        onPress={() => router.push({ pathname: '/log/[id]', params: { id: log.id } })}
        accessibilityRole="button"
        accessibilityLabel={`${lake.name}, ${formatTime(log.caughtAt)}. ${result}. ${log.method}, ${log.bait || 'no bait noted'}. Bite score ${log.scoreAtTime} at the time, ${log.lightCondition}. ${syncText}.${justSaved ? ' Just saved.' : ''}`}
        accessibilityHint="Edit this log"
        style={({ pressed }) => [styles.entry, justSaved && styles.entrySaved, pressed && { opacity: 0.85 }]}
      >
        <View style={[styles.count, { backgroundColor: log.caught ? colors.successTint : colors.fog }]}>
          <T variant="numeralM" color={log.caught ? colors.success : colors.inkFaint}>{log.caught ? log.count : '–'}</T>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Row justify="space-between" gap={spacing.sm}>
            <T variant="subhead" numberOfLines={1} style={{ flex: 1 }}>{lake.name}</T>
            <T variant="caption" color={colors.inkMuted}>{formatTime(log.caughtAt)}</T>
          </Row>
          <T variant="caption" color={colors.inkSoft} numberOfLines={1}>
            {capitalize(log.method)} · {log.bait || 'No bait noted'}{log.lengthCm ? ` · biggest ${toDisplayLength(log.lengthCm, units)} ${lengthUnit(units)}` : ''}
          </T>
          <Row gap={spacing.md}>
            <Row gap={4}>
              <View style={[styles.bandDot, { backgroundColor: band.color }]} />
              <T variant="caption" color={colors.inkMuted}>{log.scoreAtTime} · {log.lightCondition}</T>
            </Row>
            <View style={{ flex: 1 }} />
            {justSaved ? (
              <Row gap={4}><Icon name="success" size={12} color={colors.success} /><T variant="caption" weight="700" color={colors.success}>Saved</T></Row>
            ) : unsynced ? (
              <Row gap={4}><Icon name={log.syncState === 'error' ? 'sync-error' : 'device'} size={12} color={log.syncState === 'error' ? colors.danger : colors.inkMuted} /><T variant="caption" color={log.syncState === 'error' ? colors.danger : colors.inkMuted}>{log.syncState === 'error' ? 'Not synced' : 'Local'}</T></Row>
            ) : (
              <Icon name="sync-done" size={13} color={colors.inkFaint} />
            )}
          </Row>
        </View>
      </Pressable>
    </Row>
  );
}

const RAIL = 14;

const styles = StyleSheet.create({
  summary: { gap: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.md, paddingHorizontal: spacing.lg, borderRadius: radius.xl, backgroundColor: colors.white, ...elevation.low },
  statDivider: { width: StyleSheet.hairlineWidth * 2, alignSelf: 'stretch', backgroundColor: colors.line },
  patterns: { gap: 6, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: colors.line },
  dayRow: { paddingVertical: spacing.sm, alignItems: 'center' },
  rail: { width: RAIL, alignItems: 'center', alignSelf: 'stretch', justifyContent: 'flex-start' },
  railLine: { position: 'absolute', top: 0, bottom: 0, width: 2, borderRadius: 1, backgroundColor: colors.fogDeep },
  dayDot: { marginTop: 5, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.inkFaint },
  entryDot: { marginTop: 26, width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
  entryDotCaught: { backgroundColor: colors.teal, borderColor: colors.white },
  entryDotNone: { backgroundColor: colors.cream, borderColor: colors.inkFaint },
  entry: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.paper, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: colors.line },
  entrySaved: { borderColor: colors.teal, borderWidth: 1.5 },
  count: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  bandDot: { width: 7, height: 7, borderRadius: 4 },
});
