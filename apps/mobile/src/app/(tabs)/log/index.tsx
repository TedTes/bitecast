import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon } from '@/components/icon';
import { Button, Card, ChoiceChips, EmptyState, ProgressBar, Reveal, Row, Screen, SkeletonCard, T } from '@/components/ui';
import { ShorelineHeader } from '@/components/shoreline-header';
import { WalleyeArt } from '@/components/walleye';
import { colors, radius, scoreBand, scoreBands, spacing, touch } from '@/constants/theme';
import { integrationsReady } from '@/api/config';
import { lakeById } from '@/data/lakes';
import { baitsText } from '@/features/trip-baits';
import { methodsText } from '@/features/trip-methods';
import { formatDay, formatTime, lengthUnit, startOfDay, toDisplayLength } from '@/lib/format';
import { useNow } from '@/lib/use-now';
import { useAppStore } from '@/store/use-app-store';
import type { CatchLog } from '@/types/app';

/*
 * A field journal: your trips are the content. Logging itself lives on the centre “+”
 * tab button, so this screen has no big action blocks — the tally is the header, then a
 * patterns line, a compact filter and a day-by-day timeline.
 */

type Filter = 'all' | 'caught' | 'none';
const STATS_MIN = 5;
const FILTER_MIN = 5;
/** Below this many trips a catch rate says nothing, so the header leaves it out. */
const RATE_MIN = 3;

const lightLabel: Record<CatchLog['lightCondition'], string> = { 'Low light': 'low light', 'Mid light': 'mid light', Bright: 'bright light' };
/** Lowercase am/pm, matching the rest of the app (“7–11 am”). */
const clock = (value: string) => formatTime(value).replace(/\s?([AP])M/i, (_, p: string) => ` ${p.toLowerCase()}m`);
/** “Jig + minnow” already says jig, so the method is only added when the bait doesn’t name it. */
function gearText(log: CatchLog) {
  const methods = methodsText(log);
  const baits = baitsText(log);
  const named = methods.split(', ').every((method) => baits.toLowerCase().includes(method.toLowerCase()));
  return named ? baits : `${methods} · ${baits}`;
}

export default function LogListScreen() {
  const logs = useAppStore((state) => state.catchLogs);
  const hydrated = useAppStore((state) => state.hydrated);
  const lastSaved = useAppStore((state) => state.lastSaved);
  const units = useAppStore((state) => state.settings.units);
  const syncPending = useAppStore((state) => state.syncPending);
  const offline = useAppStore((state) => state.connectivity === 'offline');
  const [filter, setFilter] = useState<Filter>('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const now = useNow(15_000);

  const caughtTrips = logs.filter((log) => log.caught).length;
  const canFilter = logs.length >= FILTER_MIN && caughtTrips > 0 && caughtTrips < logs.length;
  const activeFilter = canFilter ? filter : 'all';
  const filtered = logs.filter((log) => activeFilter === 'all' || log.caught === (activeFilter === 'caught'));
  const groups = filtered.reduce<{ key: string; label: string; items: CatchLog[] }[]>((acc, log) => {
    const key = startOfDay(new Date(log.caughtAt)).toISOString();
    const group = acc.find((item) => item.key === key);
    if (group) group.items.push(log);
    else acc.push({ key, label: formatDay(log.caughtAt), items: [log] });
    return acc;
  }, []);
  const recent = lastSaved && now - lastSaved.at < 60_000 ? lastSaved.id : null;
  const fish = logs.reduce((total, log) => total + (log.caught ? log.count : 0), 0);
  const rate = logs.length ? Math.round((caughtTrips / logs.length) * 100) : 0;
  const toGo = STATS_MIN - logs.length;
  // A timeline only earns its rail once trips span more than one day.
  const timeline = groups.length > 1;

  const retrySync = async () => {
    setSyncing(true);
    await syncPending().catch(() => undefined);
    setSyncing(false);
  };

  return (
    <Screen
      tab
      top={
        <ShorelineHeader
          // The tab already says “Log”, so the header is your tally: the catch, then how it came.
          title={!hydrated ? 'Your fish tales' : !logs.length ? 'First cast awaits' : fish ? `${fish} in the net` : 'The net’s still dry'}
          subtitle={
            !hydrated || !logs.length
              ? 'Your field notes'
              : `${fish ? 'Walleye · ' : ''}${logs.length} trip${logs.length === 1 ? '' : 's'}${fish && logs.length >= RATE_MIN ? ` · ${rate}% with fish` : ''}`
          }
        />
      }
    >
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
          <Card
            style={styles.patterns}
            onPress={() => router.push('/(tabs)/log/stats')}
            accessibilityLabel={logs.length >= STATS_MIN ? 'Your patterns: best hours, lures and light conditions' : `${toGo} more trip${toGo === 1 ? '' : 's'} to see your patterns. ${logs.length} of ${STATS_MIN} logged.`}
          >
            <Row gap={spacing.sm}>
              <Icon name="chart" size={14} color={colors.teal} />
              <T variant="caption" weight="600" color={colors.teal} style={{ flex: 1 }}>
                {logs.length >= STATS_MIN ? 'Your patterns' : `${toGo} more trip${toGo === 1 ? '' : 's'} to see your patterns`}
              </T>
              <Icon name="chevron-right" size={13} color={colors.teal} />
            </Row>
            {logs.length < STATS_MIN ? <ProgressBar value={logs.length / STATS_MIN} label="Progress to personal patterns" height={4} /> : null}
          </Card>

          <View>
            {canFilter ? (
              <>
                <Pressable
                  onPress={() => setFilterOpen((open) => !open)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: filterOpen }}
                  style={styles.filterButton}
                >
                  <Icon name="filter" size={14} color={colors.teal} />
                  <T variant="caption" weight="600" color={colors.teal}>
                    {activeFilter === 'all' ? 'Filter' : activeFilter === 'caught' ? 'Filter · Caught' : 'Filter · No catch'}
                  </T>
                </Pressable>
                {filterOpen ? (
                  <ChoiceChips<Filter>
                    label="Filter trips by catch"
                    value={activeFilter}
                    onChange={(value) => {
                      setFilter(value);
                      setFilterOpen(false);
                    }}
                    options={[
                      { label: 'All', value: 'all' },
                      { label: 'Caught', value: 'caught' },
                      { label: 'No catch', value: 'none' },
                    ]}
                  />
                ) : null}
              </>
            ) : null}
            {groups.map((group) => (
              <View key={group.key}>
                <Row gap={spacing.md} style={styles.dayRow}>
                  {timeline ? <View style={styles.rail}><View style={styles.railLine} /><View style={styles.dayDot} /></View> : null}
                  <T variant="label" color={colors.inkMuted} accessibilityRole="header">{group.label}</T>
                </Row>
                {group.items.map((log, index) => (
                  <Reveal key={log.id} index={index}>
                    <Entry log={log} justSaved={log.id === recent} units={units} offline={offline} retrying={syncing} onRetry={retrySync} timeline={timeline} />
                  </Reveal>
                ))}
              </View>
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}

/** One trip on the timeline: catch badge → lake + time → what you used → conditions then. */
function Entry({ log, justSaved, units, offline, retrying, onRetry, timeline }: {
  log: CatchLog;
  timeline: boolean;
  justSaved: boolean;
  units: 'metric' | 'imperial';
  offline: boolean;
  retrying: boolean;
  onRetry: () => void;
}) {
  const lake = lakeById(log.lakeId);
  const band = scoreBands[scoreBand(log.scoreAtTime)];
  const failed = log.syncState === 'error';
  const synced = log.syncState === 'synced';
  const syncText = synced ? 'Synced' : !integrationsReady ? 'Saved on this device' : failed ? 'Sync failed' : 'Pending sync';
  const result = log.caught ? `${log.count} walleye` : 'No catch';
  return (
    <Row gap={spacing.md} align="stretch">
      {timeline ? (
        <View style={styles.rail}>
          <View style={styles.railLine} />
          <View style={[styles.entryDot, log.caught ? styles.entryDotCaught : styles.entryDotNone]} />
        </View>
      ) : null}
      <View style={[styles.entry, justSaved && styles.entrySaved]}>
        <Pressable
          onPress={() => router.push({ pathname: '/log/[id]', params: { id: log.id } })}
          accessibilityRole="button"
          accessibilityLabel={`${lake.name}, ${clock(log.caughtAt)}. ${result}. ${methodsText(log)}, ${baitsText(log)}. Forecast ${log.scoreAtTime} at the time, ${lightLabel[log.lightCondition]}.${synced ? '' : ` ${syncText}.`}${justSaved ? ' Just saved.' : ''}`}
          accessibilityHint="Edit this log"
          style={({ pressed }) => [styles.entryBody, pressed && { opacity: 0.85 }]}
        >
          <View style={[styles.count, { backgroundColor: log.caught ? colors.successTint : colors.fog }]}>
            <T variant="numeralS" color={log.caught ? colors.success : colors.inkMuted}>{log.caught ? log.count : '–'}</T>
            <T variant="caption" color={log.caught ? colors.success : colors.inkMuted} maxFontSizeMultiplier={1.1} style={styles.countLabel}>fish</T>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Row justify="space-between" gap={spacing.sm}>
              <T variant="subhead" numberOfLines={1} style={{ flex: 1 }}>{lake.name}</T>
              <T variant="caption" color={colors.inkMuted}>{clock(log.caughtAt)}</T>
            </Row>
            <T variant="caption" color={colors.inkSoft} numberOfLines={1}>
              {gearText(log)}{log.lengthCm ? ` · biggest ${toDisplayLength(log.lengthCm, units)} ${lengthUnit(units)}` : ''}
            </T>
            <Row gap={4}>
              <View style={[styles.bandDot, { backgroundColor: band.color }]} />
              <T variant="caption" color={colors.inkMuted}>Forecast {log.scoreAtTime} · {lightLabel[log.lightCondition]}</T>
            </Row>
          </View>
        </Pressable>
        {!synced ? (
          <Row gap={6} wrap style={styles.syncRow}>
            <Icon name={failed ? 'sync-error' : 'device'} size={13} color={failed ? colors.danger : colors.inkMuted} />
            <T variant="caption" color={failed ? colors.danger : colors.inkMuted} style={{ flexShrink: 1 }}>
              {failed && offline && integrationsReady ? 'Sync failed · offline' : syncText}
            </T>
            {failed && integrationsReady && !offline ? (
              <Button variant="ghost" size="sm" loading={retrying} loadingLabel="Retrying…" accessibilityHint="Retries trips waiting to sync" onPress={onRetry}>
                Retry
              </Button>
            ) : null}
          </Row>
        ) : null}
      </View>
    </Row>
  );
}

const RAIL = 14;

const styles = StyleSheet.create({
  patterns: { gap: 6, minHeight: touch.min, justifyContent: 'center', paddingVertical: spacing.md },
  filterButton: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', gap: 6, minHeight: touch.min, paddingHorizontal: spacing.sm },
  dayRow: { paddingVertical: spacing.sm, alignItems: 'center' },
  rail: { width: RAIL, alignItems: 'center', alignSelf: 'stretch', justifyContent: 'flex-start' },
  railLine: { position: 'absolute', top: 0, bottom: 0, width: 2, borderRadius: 1, backgroundColor: colors.fogDeep },
  dayDot: { marginTop: 5, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.inkFaint },
  entryDot: { marginTop: 26, width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
  entryDotCaught: { backgroundColor: colors.teal, borderColor: colors.paper },
  entryDotNone: { backgroundColor: colors.cream, borderColor: colors.inkFaint },
  entry: { flex: 1, marginBottom: spacing.sm, borderRadius: radius.lg, backgroundColor: colors.paper, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: colors.line },
  entryBody: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  syncRow: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm, minHeight: 28 },
  entrySaved: { borderColor: colors.teal, borderWidth: 1.5 },
  count: { width: 44, height: 44, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  countLabel: { fontSize: 10.5, lineHeight: 12 },
  bandDot: { width: 7, height: 7, borderRadius: 4 },
});
