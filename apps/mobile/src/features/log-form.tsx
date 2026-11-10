import { useMemo, useState } from 'react';
import { randomUUID } from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Icon } from '@/components/icon';
import { Banner, Button, Card, ChoiceChips, EmptyState, Field, IceSafetyNotice, Reveal, Row, Screen, Segmented, SkeletonCard, Stepper, T, ToggleRow } from '@/components/ui';
import { ConfidenceMeter, ScoreReadout } from '@/components/forecast';
import { colors, elevation, radius, spacing, touch } from '@/constants/theme';
import { lakes, lakeById } from '@/data/lakes';
import { getForecast } from '@/data/forecasts';
import { depthUnit, formatDay, formatTime, formatWind, fromDisplayDepth, fromDisplayLength, lengthUnit, toDisplayDepth, toDisplayLength } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { resolveLakeCondition } from '@/features/lake-season';
import { useAppStore } from '@/store/use-app-store';
import type { CatchLog } from '@/types/app';

const OTHER = '__other__';
const NOTES_MAX = 500;
const presets = {
  open_water: ['Jig + minnow', 'Crankbait', 'Worm harness', 'Blade bait'],
  ice: ['Jigging spoon', 'Minnow on tip-up', 'Jig + minnow head', 'Rattle bait'],
};
const limits = {
  metric: { length: [10, 110], depth: [0, 60] },
  imperial: { length: [4, 43], depth: [0, 200] },
} as const;

/** Route wrapper: waits for local data so edit defaults are never wrong. */
export function LogForm({ editId }: { editId?: string }) {
  const hydrated = useAppStore((state) => state.hydrated);
  const previous = useAppStore((state) => state.catchLogs.find((item) => item.id === editId));
  if (editId && !hydrated) {
    return (
      <Screen header>
        <SkeletonCard lines={4} />
      </Screen>
    );
  }
  if (editId && !previous) {
    return (
      <Screen header>
        <EmptyState icon="log" title="Log not found" body="It may have been removed from this device." action={<Button variant="secondary" onPress={() => router.back()}>Go back</Button>} />
      </Screen>
    );
  }
  return <LogFormInner key={editId ?? 'new'} previous={previous} />;
}

function LogFormInner({ previous }: { previous?: CatchLog }) {
  const params = useLocalSearchParams<{ lakeId?: string; score?: string }>();
  const logs = useAppStore((state) => state.catchLogs);
  const followed = useAppStore((state) => state.followedLakeIds);
  const iceFishing = useAppStore((state) => state.settings.iceFishing);
  const lakeSeasons = useAppStore((state) => state.lakeSeasons);
  const units = useAppStore((state) => state.settings.units);
  const add = useAppStore((state) => state.addCatchLog);
  const last = logs[0];
  const seasonOf = (id: string) => resolveLakeCondition(id, { iceFishing }, lakeSeasons).season;

  // Defaults: the last trip's setup, so a typical entry is lake ✓ → result → save.
  const [lakeId, setLakeId] = useState(previous?.lakeId ?? params.lakeId ?? last?.lakeId ?? followed[0] ?? lakes[0].id);
  const [caught, setCaught] = useState(previous?.caught ?? true);
  const [count, setCount] = useState(previous?.count || 1);
  const season = seasonOf(lakeId);
  const recentBaits = useMemo(() => Array.from(new Set(logs.map((log) => log.bait.trim()).filter(Boolean))).slice(0, 4), [logs]);
  const baitOptions = useMemo(() => Array.from(new Set([...recentBaits, ...presets[season]])).slice(0, 6), [recentBaits, season]);
  const initialBait = previous?.bait ?? last?.bait ?? presets[season][0];
  const [baitChoice, setBaitChoice] = useState(baitOptions.includes(initialBait) ? initialBait : OTHER);
  const [customBait, setCustomBait] = useState(baitOptions.includes(initialBait) ? '' : initialBait);
  const [method, setMethod] = useState<CatchLog['method']>(previous?.method ?? last?.method ?? (season === 'ice' ? 'tip-up' : 'jig'));
  const [length, setLength] = useState(previous?.lengthCm ? String(toDisplayLength(previous.lengthCm, units)) : '');
  const [depth, setDepth] = useState(previous?.depthM !== undefined ? String(toDisplayDepth(previous.depthM, units)) : '');
  const [waterDepth, setWaterDepth] = useState(previous?.waterDepthM !== undefined ? String(toDisplayDepth(previous.waterDepthM, units)) : '');
  const [effortMinutes, setEffortMinutes] = useState(previous?.effortMinutes ?? 120);
  const [trainingConsent, setTrainingConsent] = useState(previous?.trainingConsent ?? false);
  const [clarity, setClarity] = useState<CatchLog['clarity']>(previous?.clarity ?? lakeById(lakeId).clarity);
  const [notes, setNotes] = useState(previous?.notes ?? '');
  const [showDetails, setShowDetails] = useState(Boolean(previous?.lengthCm || previous?.depthM !== undefined || previous?.waterDepthM !== undefined || previous?.notes || previous?.trainingConsent));
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const forecast = useMemo(() => getForecast(lakeId, season), [lakeId, season]);
  const hour = forecast.hours[0];
  const keepPrevious = previous && previous.lakeId === lakeId;
  const score = keepPrevious ? previous.scoreAtTime : Number(params.score) || hour.score;
  const lightCondition: CatchLog['lightCondition'] = keepPrevious ? previous.lightCondition : hour.light < 0.25 ? 'Low light' : hour.light < 0.55 ? 'Mid light' : 'Bright';
  const lakeChoices = lakes.filter((lake) => followed.includes(lake.id) || lake.id === lakeId || lake.id === last?.lakeId);
  const bait = baitChoice === OTHER ? customBait.trim() : baitChoice;

  const parse = (value: string) => (value.trim() === '' ? undefined : Number(value.replace(',', '.')));
  const lengthValue = parse(length);
  const depthValue = parse(depth);
  const waterDepthValue = parse(waterDepth);
  const range = limits[units];
  const errors = {
    bait: baitChoice === OTHER && !customBait.trim() ? 'Enter a bait or lure, or pick one above.' : customBait.length > 60 ? 'Keep it under 60 characters.' : null,
    length: lengthValue !== undefined && (Number.isNaN(lengthValue) || lengthValue < range.length[0] || lengthValue > range.length[1]) ? `Enter a length between ${range.length[0]} and ${range.length[1]} ${lengthUnit(units)}.` : null,
    depth: depthValue !== undefined && (Number.isNaN(depthValue) || depthValue < range.depth[0] || depthValue > range.depth[1]) ? `Enter a depth between ${range.depth[0]} and ${range.depth[1]} ${depthUnit(units)}.` : null,
    waterDepth: waterDepthValue !== undefined && (Number.isNaN(waterDepthValue) || waterDepthValue < range.depth[0] || waterDepthValue > range.depth[1]) ? `Enter a water depth between ${range.depth[0]} and ${range.depth[1]} ${depthUnit(units)}.` : null,
    notes: notes.length > NOTES_MAX ? `Notes are limited to ${NOTES_MAX} characters.` : null,
  };
  const errorCount = Object.values(errors).filter(Boolean).length;
  const shown = (key: keyof typeof errors) => (attempted || (key !== 'bait' && key !== 'notes') ? errors[key] : null);

  const save = async () => {
    setAttempted(true);
    if (errorCount) {
      haptic.error();
      if (errors.length || errors.depth || errors.waterDepth || errors.notes) setShowDetails(true);
      return;
    }
    setSaving(true);
    setSaveError(null);
    const end = previous?.tripEndedAt ? new Date(previous.tripEndedAt) : new Date();
    const start = new Date(end.getTime() - effortMinutes * 60_000);
    const now = new Date().toISOString();
    const log: CatchLog = {
      id: previous?.id ?? randomUUID(),
      lakeId,
      caughtAt: previous?.caughtAt ?? new Date(end.getTime() - (caught ? 60_000 : 0)).toISOString(),
      tripStartedAt: start.toISOString(),
      tripEndedAt: end.toISOString(),
      effortMinutes,
      species: 'walleye',
      seasonMode: season,
      caught,
      count: caught ? Math.max(1, count) : 0,
      lengthCm: caught && lengthValue !== undefined ? fromDisplayLength(lengthValue, units) : undefined,
      depthM: depthValue !== undefined ? fromDisplayDepth(depthValue, units) : undefined,
      waterDepthM: waterDepthValue !== undefined ? fromDisplayDepth(waterDepthValue, units) : undefined,
      bait,
      baitCategory: bait.toLowerCase(),
      method,
      clarity,
      notes: notes.trim(),
      scoreAtTime: score,
      trainingConsent,
      modelVersionShown: forecast.engineVersion,
      lightCondition,
      conditions: keepPrevious ? previous.conditions : { temperatureC: 11, windKmh: hour.windKmh, summary: hour.reasons[0] ?? 'Cached forecast' },
      syncState: 'pending',
      clientUpdatedAt: now,
    };
    try {
      await add(log); // SQLite write completes before any sync is attempted.
      haptic.success();
      router.back();
    } catch {
      haptic.error();
      setSaveError('Your log couldn’t be written to this device. Nothing was lost from the form — try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      header
      footer={
        <>
          {attempted && errorCount ? (
            <T variant="caption" color={colors.danger} align="center" accessibilityLiveRegion="assertive">
              Check {errorCount} field{errorCount > 1 ? 's' : ''} before saving
            </T>
          ) : null}
          <Button icon="device" loading={saving} loadingLabel="Saving…" onPress={save}>{previous ? 'Save changes' : 'Save to this device'}</Button>
          <T variant="caption" color={colors.inkMuted} align="center">Works offline · syncs later</T>
        </>
      }
    >
      {saveError ? <Banner tone="danger" title="Not saved" body={saveError} action={{ label: 'Try again', onPress: save }} live /> : null}
      {previous ? (
        <T variant="caption" color={colors.inkMuted}>Logged {formatDay(previous.caughtAt)} at {formatTime(previous.caughtAt)}</T>
      ) : null}

      {/* 1 · Lake */}
      <View style={{ gap: spacing.sm }}>
        <T variant="label" color={colors.inkMuted}>Lake</T>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -spacing.xl }} contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.sm }}>
          <ChoiceChips
            label="Lake"
            value={lakeId}
            onChange={(id) => {
              setLakeId(id);
              setClarity(lakeById(id).clarity);
            }}
            options={lakeChoices.map((lake) => ({ label: lake.name, value: lake.id }))}
          />
        </ScrollView>
      </View>

      {/* 2 · Result */}
      <View style={{ gap: spacing.sm }}>
        <T variant="label" color={colors.inkMuted}>Result</T>
        <Row gap={spacing.sm} accessibilityRole="radiogroup">
          <ResultOption active={caught} icon="lure" label="Caught walleye" onPress={() => setCaught(true)} />
          <ResultOption active={!caught} icon="close" label="No catch" onPress={() => setCaught(false)} />
        </Row>
        {!caught ? <T variant="caption" color={colors.inkMuted}>No-catch trips matter — they show when conditions didn’t deliver.</T> : null}
      </View>

      {caught ? (
        <Reveal>
          <Card style={{ paddingVertical: spacing.md }}>
            <Stepper label="Walleye caught" value={count} onChange={setCount} min={1} max={99} unit="walleye" />
          </Card>
        </Reveal>
      ) : null}

      {/* 3 · Bait */}
      <Card style={{ paddingVertical: spacing.md }}>
        <Stepper label="Trip duration" value={effortMinutes} onChange={setEffortMinutes} min={15} max={720} step={15} unit="minutes" />
      </Card>

      {/* 3 · Bait */}
      <View style={{ gap: spacing.sm }}>
        <T variant="label" color={colors.inkMuted}>Bait or lure</T>
        <ChoiceChips
          label="Bait or lure"
          value={baitChoice}
          onChange={setBaitChoice}
          options={[...baitOptions.map((item) => ({ label: item, value: item })), { label: 'Other…', value: OTHER }]}
        />
        {baitChoice === OTHER ? <Field label="Bait or lure name" value={customBait} onChangeText={setCustomBait} placeholder="e.g. Purple hair jig" autoFocus={!previous} error={shown('bait')} maxLength={80} returnKeyType="done" /> : null}
      </View>

      {/* 4 · Method */}
      <View style={{ gap: spacing.sm }}>
        <T variant="label" color={colors.inkMuted}>Method</T>
        <Segmented
          label="Method"
          value={method}
          onChange={setMethod}
          options={[{ label: 'Jig', value: 'jig' }, { label: 'Troll', value: 'troll' }, { label: 'Tip-up', value: 'tip-up' }, { label: 'Cast', value: 'cast' }]}
        />
      </View>

      {/* 5 · Optional details */}
      <Pressable
        onPress={() => setShowDetails((value) => !value)}
        accessibilityRole="button"
        accessibilityState={{ expanded: showDetails }}
        style={styles.disclosure}
      >
        <View style={{ flex: 1 }}>
          <T variant="subhead">More details</T>
          <T variant="caption" color={colors.inkMuted}>Length, depth, clarity and notes — all optional</T>
        </View>
        <Icon name={showDetails ? 'chevron-up' : 'chevron-down'} size={18} color={colors.inkMuted} />
      </Pressable>
      {showDetails ? (
        <Reveal style={{ gap: spacing.lg }}>
          <Row gap={spacing.md} align="flex-start">
            {caught ? (
              <View style={{ flex: 1 }}>
                <Field label="Biggest" value={length} onChangeText={setLength} keyboardType="decimal-pad" placeholder="—" suffix={lengthUnit(units)} error={shown('length')} returnKeyType="done" />
              </View>
            ) : null}
            <View style={{ flex: 1 }}>
              <Field label="Depth" value={depth} onChangeText={setDepth} keyboardType="decimal-pad" placeholder="—" suffix={depthUnit(units)} error={shown('depth')} returnKeyType="done" />
            </View>
          </Row>
          <Field label="Water depth" value={waterDepth} onChangeText={setWaterDepth} keyboardType="decimal-pad" placeholder="—" suffix={depthUnit(units)} error={shown('waterDepth')} returnKeyType="done" />
          <View style={{ gap: spacing.sm }}>
            <T variant="callout" weight="700">Water clarity</T>
            <Segmented label="Water clarity" value={clarity} onChange={setClarity} options={[{ label: 'Clear', value: 'clear' }, { label: 'Stained', value: 'stained' }, { label: 'Murky', value: 'murky' }]} />
          </View>
          <Field
            label="Notes"
            value={notes}
            onChangeText={setNotes}
            multiline
            placeholder="Structure, colour, presentation…"
            helper={`${notes.length}/${NOTES_MAX} · Describe patterns, not exact spots`}
            error={shown('notes')}
          />
          <Card variant="sunken" style={{ padding: 0 }}>
            <ToggleRow
              icon="chart"
              title="Help improve BiteCast"
              subtitle="Allow this pseudonymized trip to train future walleye models. You can leave this off and still use logging."
              value={trainingConsent}
              onValueChange={setTrainingConsent}
            />
          </Card>
        </Reveal>
      ) : null}

      {/* Attached conditions */}
      <Card variant="sunken" style={{ gap: spacing.md }}>
        <Row gap={spacing.md}>
          <View style={{ flex: 1, gap: 2 }}>
            <Row gap={6}>
              <Icon name="success" size={14} color={colors.success} />
              <T variant="subhead">Conditions attached</T>
            </Row>
            <T variant="caption" color={colors.inkMuted}>{keepPrevious ? 'From when this trip was logged' : 'From the forecast saved on this device'}</T>
          </View>
          <ScoreReadout score={score} size="sm" />
        </Row>
        <T variant="callout" color={colors.inkSoft}>
          {lightCondition}
          {keepPrevious ? ` · ${previous.conditions.summary}` : ` · ${hour.reasons.slice(0, 2).join(' · ') || 'Mixed conditions'}`}
          {season === 'ice' ? '' : ` · wind ${formatWind(keepPrevious ? previous.conditions.windKmh : hour.windKmh, units)}`}
        </T>
        {!keepPrevious ? <ConfidenceMeter value={hour.confidence} /> : null}
      </Card>

      {season === 'ice' ? <IceSafetyNotice compact /> : null}
    </Screen>
  );
}

function ResultOption({ active, icon, label, onPress }: { active: boolean; icon: 'lure' | 'close'; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      accessibilityLabel={label}
      onPress={() => {
        if (!active) haptic.select();
        onPress();
      }}
      style={({ pressed }) => [styles.result, active && styles.resultActive, pressed && { opacity: 0.85 }]}
    >
      <Icon name={icon} size={22} color={active ? colors.onDark : colors.teal} />
      <T variant="subhead" color={active ? colors.onDark : colors.ink} align="center">{label}</T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  result: { flex: 1, minHeight: touch.large + 16, alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.lineStrong, backgroundColor: colors.paper, padding: spacing.md },
  resultActive: { backgroundColor: colors.deep, borderColor: colors.deep, ...elevation.low },
  disclosure: { flexDirection: 'row', alignItems: 'center', minHeight: touch.comfortable + 8, paddingHorizontal: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
});
