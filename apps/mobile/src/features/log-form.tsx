import { useState, type PropsWithChildren } from 'react';
import { randomUUID } from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon } from '@/components/icon';
import { Banner, Button, Card, ChoiceChips, Divider, EmptyState, Field, MultiChoiceChips, Reveal, Row, Screen, Segmented, SkeletonCard, Stepper, T, ToggleRow } from '@/components/ui';
import { ConfidenceBars, ScoreBadge } from '@/components/score-badge';
import { colors, scoreBand, scoreBands, spacing, touch } from '@/constants/theme';
import { lakes, lakeById } from '@/data/lakes';
import { getForecast } from '@/data/forecasts';
import { depthUnit, formatDay, formatDuration, formatTime, formatWind, fromDisplayDepth, fromDisplayLength, lengthUnit, toDisplayDepth, toDisplayLength } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { resolveLakeCondition } from '@/features/lake-season';
import { TRAINING_CONSENT_VERSION } from '@/features/catch-log';
import { baitFields, baitOptions, baitsForSeason, baitsOf, type TripLog } from '@/features/trip-baits';
import { methodFields, methodLabels, methodOptions, methodsForSeason, methodsOf, type Method } from '@/features/trip-methods';
import { useAppStore } from '@/store/use-app-store';
import type { CatchLog } from '@/types/app';

const OTHER = '__other__';
const UNSURE = '__unsure__';
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

function LogFormInner({ previous }: { previous?: TripLog }) {
  const params = useLocalSearchParams<{ lakeId?: string; score?: string }>();
  const logs = useAppStore((state) => state.catchLogs);
  const followed = useAppStore((state) => state.followedLakeIds);
  const iceFishing = useAppStore((state) => state.settings.iceFishing);
  const lakeSeasons = useAppStore((state) => state.lakeSeasons);
  const units = useAppStore((state) => state.settings.units);
  const add = useAppStore((state) => state.addCatchLog);
  const last: TripLog | undefined = logs[0];
  const seasonOf = (id: string) => resolveLakeCondition(id, { iceFishing }, lakeSeasons).season;

  // Defaults: the last trip's setup, so a typical entry is lake ✓ → result → save.
  const [initialLakeId] = useState(() => previous?.lakeId ?? params.lakeId ?? last?.lakeId ?? followed[0] ?? lakes[0].id);
  const [lakeId, setLakeId] = useState(initialLakeId);
  // The count is the result: zero is a no-catch trip. A new trip starts at zero, so a catch is never logged by default.
  const [count, setCount] = useState(previous?.caught ? Math.max(1, previous.count) : 0);
  const caught = count > 0;
  const season = seasonOf(lakeId);
  const recordedBaits = previous ? baitsOf(previous) : [];
  const [baits, setBaits] = useState<string[]>(previous ? recordedBaits : baitsForSeason(logs, season, presets[season]));
  const [customBait, setCustomBait] = useState('');
  // Holds a chip's value, so it follows the custom name as it's typed.
  const [caughtOnBait, setCaughtOnBait] = useState<string | undefined>(previous?.caughtOnBait);
  const recordedMethods = previous ? methodsOf(previous) : [];
  const [methods, setMethods] = useState<Method[]>(previous ? recordedMethods : methodsForSeason(season, last ? methodsOf(last) : []));
  const [caughtOn, setCaughtOn] = useState<Method | undefined>(previous?.caughtOnMethod);
  const methodChoices = methodOptions(season, recordedMethods);
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

  const forecast = getForecast(lakeId, season);
  const hour = forecast.hours[0];
  const keepPrevious = previous && previous.lakeId === lakeId;
  const score = keepPrevious ? previous.scoreAtTime : Number(params.score) || hour.score;
  const lightCondition: CatchLog['lightCondition'] = keepPrevious ? previous.lightCondition : hour.light < 0.25 ? 'Low light' : hour.light < 0.55 ? 'Mid light' : 'Bright';
  const lakeChoices = lakes.filter((lake) =>
    followed.includes(lake.id) || lake.id === initialLakeId || lake.id === lakeId || lake.id === last?.lakeId,
  );
  // What will be saved always stays visible; an edited log's baits stay offered even when unticked.
  const baitChips = baitOptions(logs, season, presets[season], [...recordedBaits, ...baits.filter((item) => item !== OTHER)]);
  const baitName = (choice: string) => (choice === OTHER ? customBait.trim() : choice);

  const parse = (value: string) => (value.trim() === '' ? undefined : Number(value.replace(',', '.')));
  const lengthValue = parse(length);
  const depthValue = parse(depth);
  const waterDepthValue = parse(waterDepth);
  const range = limits[units];
  const errors = {
    baits: baits.length ? null : 'Pick at least one bait or lure.',
    bait: !baits.includes(OTHER) ? null : !customBait.trim() ? 'Enter a bait or lure, or untick Other.' : customBait.length > 60 ? 'Keep it under 60 characters.' : null,
    // Hidden at zero, so it can't be allowed to block saving there.
    length: caught && lengthValue !== undefined && (Number.isNaN(lengthValue) || lengthValue < range.length[0] || lengthValue > range.length[1]) ? `Enter a length between ${range.length[0]} and ${range.length[1]} ${lengthUnit(units)}.` : null,
    depth: depthValue !== undefined && (Number.isNaN(depthValue) || depthValue < range.depth[0] || depthValue > range.depth[1]) ? `Enter a depth between ${range.depth[0]} and ${range.depth[1]} ${depthUnit(units)}.` : null,
    waterDepth: waterDepthValue !== undefined && (Number.isNaN(waterDepthValue) || waterDepthValue < range.depth[0] || waterDepthValue > range.depth[1]) ? `Enter a water depth between ${range.depth[0]} and ${range.depth[1]} ${depthUnit(units)}.` : null,
    methods: methods.length ? null : 'Pick at least one method.',
    notes: notes.length > NOTES_MAX ? `Notes are limited to ${NOTES_MAX} characters.` : null,
  };
  const errorCount = Object.values(errors).filter(Boolean).length;
  const shown = (key: keyof typeof errors) => (attempted || (key !== 'bait' && key !== 'baits' && key !== 'notes' && key !== 'methods') ? errors[key] : null);

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
    const consentChanged = previous?.trainingConsent !== trainingConsent;
    const log: TripLog = {
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
      ...baitFields(baits.map(baitName), caughtOnBait && baits.includes(caughtOnBait) ? baitName(caughtOnBait) : undefined, caught),
      ...methodFields(methods, caughtOn, caught),
      clarity,
      notes: notes.trim(),
      scoreAtTime: score,
      trainingConsent,
      trainingConsentVersion: consentChanged
        ? TRAINING_CONSENT_VERSION
        : previous?.trainingConsentVersion ?? TRAINING_CONSENT_VERSION,
      trainingConsentUpdatedAt: consentChanged ? now : previous?.trainingConsentUpdatedAt ?? now,
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

  const attachedReasons = keepPrevious ? previous.conditions.summary : hour.reasons.slice(0, 2).join(' · ') || 'Mixed conditions';
  const attachedWind = season === 'ice' ? '' : ` · wind ${formatWind(keepPrevious ? previous.conditions.windKmh : hour.windKmh, units)}`;
  const attachedSummary = `${lightCondition} · ${attachedReasons}${attachedWind}`;
  const attachedSource = keepPrevious ? 'From when this trip was logged' : 'From the forecast saved on this device';

  return (
    <Screen
      header
      style={styles.form}
      footer={
        <>
          {attempted && errorCount ? (
            <T variant="caption" color={colors.danger} align="center" accessibilityLiveRegion="assertive">
              Check {errorCount} field{errorCount > 1 ? 's' : ''} before saving
            </T>
          ) : null}
          <Row gap={spacing.sm}>
            <Button variant="secondary" disabled={saving} onPress={() => router.back()} style={styles.action}>Cancel</Button>
            {/* Same size as Cancel: the dark fill alone makes it the main action. */}
            <Button loading={saving} loadingLabel="Saving…" onPress={save} style={styles.action}>Save</Button>
          </Row>
          <T variant="caption" color={colors.inkMuted} align="center">Saves to this phone first · works offline</T>
        </>
      }
    >
      {saveError ? <Banner tone="danger" title="Not saved" body={saveError} action={{ label: 'Try again', onPress: save }} live /> : null}
      {previous ? (
        <T variant="caption" color={colors.inkMuted}>Logged {formatDay(previous.caughtAt)} at {formatTime(previous.caughtAt)}</T>
      ) : null}

      {/* Hierarchy: section title → field label → value. Save is the only filled dark control. */}

      {/* 1 · Where */}
      <Section title="Lake">
        <ChoiceChips
          label="Lake"
          value={lakeId}
          onChange={(id) => {
            setLakeId(id);
            setClarity(lakeById(id).clarity);
            // A new trip follows the lake's season; an edited one keeps what was recorded.
            const nextSeason = seasonOf(id);
            if (!previous && nextSeason !== season) {
              setMethods(methodsForSeason(nextSeason, methods));
              setBaits(baitsForSeason(logs, nextSeason, presets[nextSeason]));
            }
          }}
          options={lakeChoices.map((lake) => ({ label: lake.name, value: lake.id }))}
        />
      </Section>

      {/* 2 · What happened */}
      <Section title="How did it go?">
        <Card style={styles.group}>
          <Stepper label="Walleye caught" hint={caught ? undefined : 'No catch'} value={count} onChange={setCount} min={0} max={99} unit="walleye" />
          <Divider />
          <Stepper label="Time fished" value={effortMinutes} onChange={setEffortMinutes} min={15} max={720} step={15} unit="minutes" format={(minutes) => formatDuration(minutes * 60_000)} />
        </Card>
      </Section>

      {/* 3 · How */}
      <Section title="Setup">
        <Card style={styles.group}>
          <View style={styles.block}>
            <Row justify="space-between">
              <T variant="caption" color={colors.inkMuted}>Bait or lure</T>
              <T variant="caption" color={colors.inkMuted}>Pick all you used</T>
            </Row>
            <MultiChoiceChips
              label="Baits and lures used"
              values={baits}
              onChange={setBaits}
              options={[...baitChips.map((item) => ({ label: item, value: item })), { label: 'Other…', value: OTHER }]}
            />
            {shown('baits') ? <T variant="caption" color={colors.danger} accessibilityLiveRegion="polite">{errors.baits}</T> : null}
            {baits.includes(OTHER) ? <Field label="Bait or lure name" value={customBait} onChangeText={setCustomBait} placeholder="e.g. Purple hair jig" autoFocus error={shown('bait')} maxLength={80} returnKeyType="done" /> : null}
            {caught && baits.length > 1 ? (
              <CaughtOn
                label="Caught on which bait?"
                value={caughtOnBait && baits.includes(caughtOnBait) ? caughtOnBait : undefined}
                onChange={setCaughtOnBait}
                options={baits.map((value) => ({ label: baitName(value) || 'Other', value }))}
              />
            ) : null}
          </View>
          <Divider />
          <View style={styles.block}>
            <Row justify="space-between">
              <T variant="caption" color={colors.inkMuted}>Method</T>
              <T variant="caption" color={colors.inkMuted}>Pick all you used</T>
            </Row>
            <MultiChoiceChips label="Methods used" values={methods} onChange={setMethods} options={methodChoices.map((value) => ({ label: methodLabels[value], value }))} />
            {shown('methods') ? <T variant="caption" color={colors.danger} accessibilityLiveRegion="polite">{errors.methods}</T> : null}
            {caught && methods.length > 1 ? (
              <CaughtOn
                label="Caught on which method?"
                value={caughtOn && methods.includes(caughtOn) ? caughtOn : undefined}
                onChange={setCaughtOn}
                options={methodChoices.filter((value) => methods.includes(value)).map((value) => ({ label: methodLabels[value], value }))}
              />
            ) : null}
          </View>
        </Card>
      </Section>

      {/* 4 · Optional details, opening inside their own group */}
      <Card style={styles.group}>
        <Pressable
          onPress={() => setShowDetails((value) => !value)}
          accessibilityRole="button"
          accessibilityState={{ expanded: showDetails }}
          style={({ pressed }) => [styles.disclosure, pressed && { opacity: 0.6 }]}
        >
          <View style={{ flex: 1 }}>
            <T variant="callout" weight="600">More details</T>
            <T variant="caption" color={colors.inkMuted}>Length, depth, clarity and notes — all optional</T>
          </View>
          <Icon name={showDetails ? 'chevron-up' : 'chevron-down'} size={14} color={colors.inkMuted} />
        </Pressable>
        {showDetails ? (
          <Reveal style={styles.details}>
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
              <T variant="callout" weight="600">Water clarity</T>
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
            <Divider />
            <ToggleRow
              icon="chart"
              title="Help improve DawnBite"
              subtitle="Allow this pseudonymized trip to train future walleye models. You can leave this off and still use logging."
              value={trainingConsent}
              onValueChange={setTrainingConsent}
            />
          </Reveal>
        ) : null}
      </Card>

      {/* 5 · Filled in automatically, so it reads as a quiet receipt rather than a card */}
      <View
        style={styles.attached}
        accessible
        accessibilityLabel={`Conditions attached. ${attachedSource}. Bite score ${score}, ${scoreBands[scoreBand(score)].label}. ${attachedSummary}.${keepPrevious ? '' : ` ${hour.confidence} confidence.`}`}
      >
        <ScoreBadge score={score} />
        <View style={{ flex: 1, gap: 2 }}>
          <Row justify="space-between" wrap>
            <T variant="caption" weight="600" color={colors.inkSoft}>Conditions attached</T>
            {keepPrevious ? null : <ConfidenceBars level={hour.confidence} long />}
          </Row>
          <T variant="caption" color={colors.inkMuted}>{attachedSummary}</T>
          <T variant="caption" color={colors.inkMuted}>{attachedSource}</T>
        </View>
      </View>

    </Screen>
  );
}

/** A follow-up asked only when there's more than one answer. It starts at “Not sure”, so nothing is guessed. */
function CaughtOn<V extends string>({ label, options, value, onChange }: { label: string; options: { label: string; value: V }[]; value: V | undefined; onChange: (value: V | undefined) => void }) {
  return (
    <View style={styles.followUp}>
      <T variant="caption" color={colors.inkMuted}>{label}</T>
      <ChoiceChips<V | typeof UNSURE>
        label={label}
        value={value ?? UNSURE}
        onChange={(next) => onChange(next === UNSURE ? undefined : (next as V))}
        options={[...options, { label: 'Not sure', value: UNSURE }]}
      />
    </View>
  );
}

function Section({ title, children }: PropsWithChildren<{ title: string }>) {
  return (
    <View style={{ gap: spacing.xs }}>
      <T variant="subhead" accessibilityRole="header">{title}</T>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  form: { paddingTop: spacing.xs },
  // Equal halves, so neither button shifts when Save turns into “Saving…”.
  action: { flexGrow: 1, flexBasis: 0, paddingHorizontal: spacing.sm },
  // Bleeds to the screen edges so a long list of lakes scrolls under them.
  group: { gap: 0, paddingVertical: 0 },
  block: { gap: spacing.xs, paddingVertical: spacing.md },
  // Indented behind a rule, so it reads as a question about the chips above, not more chips.
  followUp: { gap: spacing.xs, marginTop: spacing.sm, paddingLeft: spacing.md, borderLeftWidth: 2, borderLeftColor: colors.tealTint },
  disclosure: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: touch.min, paddingVertical: spacing.sm },
  details: { gap: spacing.lg, paddingBottom: spacing.md },
  attached: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
});
