import { useMemo, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Icon } from '@/components/icon';
import { StepHeader } from '@/components/onboarding';
import { Banner, Button, EmptyState, OfflineBanner, PageHeader, Row, Screen, T } from '@/components/ui';
import { colors, hitSlop, radius, spacing, touch } from '@/constants/theme';
import { lakes } from '@/data/lakes';
import { capitalize } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useAppStore } from '@/store/use-app-store';
import type { Lake } from '@/types/app';

const MAX = 5;
const regions = ['All', ...Array.from(new Set(lakes.map((lake) => lake.region)))];

function LakeRow({ lake, selected, disabled, onPress }: { lake: Lake; selected: boolean; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected, disabled }}
      accessibilityLabel={`${lake.name}, ${lake.region}, ${lake.clarity} water`}
      accessibilityHint={disabled ? `You can follow up to ${MAX} lakes` : undefined}
      style={({ pressed }) => [styles.row, selected && styles.rowSelected, disabled && { opacity: 0.45 }, pressed && { opacity: 0.8 }]}
    >
      <View style={[styles.lakeIcon, selected && { backgroundColor: colors.teal }]}>
        <Icon name="lake" size={20} color={selected ? colors.onDark : colors.teal} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="subhead">{lake.name}</T>
        <T variant="caption" color={colors.inkMuted}>{lake.region} · {capitalize(lake.clarity)} water</T>
      </View>
      <View style={[styles.check, selected && styles.checkSelected]}>
        <Icon name={selected ? 'check' : 'plus'} size={16} color={selected ? colors.onDark : colors.inkMuted} />
      </View>
    </Pressable>
  );
}

export default function LakesScreen() {
  const [query, setQuery] = useState('');
  const [region, setRegion] = useState('All');
  const selected = useAppStore((state) => state.followedLakeIds);
  const toggle = useAppStore((state) => state.toggleLake);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return lakes.filter((lake) => (region === 'All' || lake.region === region) && (!q || `${lake.name} ${lake.region} ${lake.provinceState}`.toLowerCase().includes(q)));
  }, [query, region]);
  const full = selected.length >= MAX;

  const onToggle = (id: string) => {
    const isSelected = selected.includes(id);
    if (!isSelected && full) { haptic.warning(); return; }
    haptic.select();
    toggle(id);
  };

  return (
    <Screen
      footer={
        <>
          <Row justify="space-between">
            <T variant="callout" weight="700" accessibilityLiveRegion="polite">{selected.length} of {MAX} followed</T>
            {selected.length === 0 ? <T variant="caption" color={colors.inkMuted}>Pick at least one lake</T> : null}
          </Row>
          <Button iconRight="chevron-right" disabled={selected.length === 0} onPress={() => router.push('/(onboarding)/preview')}>See my first forecast</Button>
        </>
      }
    >
      <StepHeader step={2} />
      <PageHeader title="Pick your home water." lede="Follow up to five lakes. We’ll line up their best windows side by side." />
      <OfflineBanner what="The lake list is stored on this device." />

      <View style={styles.search}>
        <Icon name="search" size={18} color={colors.inkMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search lakes or regions"
          placeholderTextColor={colors.inkFaint}
          style={styles.input}
          accessibilityLabel="Search lakes or regions"
          returnKeyType="search"
          autoCorrect={false}
          maxFontSizeMultiplier={1.8}
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} hitSlop={hitSlop} accessibilityRole="button" accessibilityLabel="Clear search" style={styles.clear}>
            <Icon name="close" size={14} color={colors.inkSoft} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }} style={{ marginHorizontal: -spacing.xl }}>
        <View style={{ width: spacing.xl - spacing.sm }} />
        {regions.map((item) => {
          const active = item === region;
          return (
            <Pressable
              key={item}
              onPress={() => setRegion(item)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Region filter: ${item}`}
              style={[styles.filter, active && styles.filterActive]}
            >
              <T variant="callout" weight="700" color={active ? colors.onDark : colors.ink}>{item}</T>
            </Pressable>
          );
        })}
        <View style={{ width: spacing.xl - spacing.sm }} />
      </ScrollView>

      {full ? <Banner tone="info" body={`You’re following ${MAX} lakes — the maximum. Remove one to add another.`} live /> : null}

      <View style={{ gap: spacing.sm }}>
        {results.map((lake) => {
          const isSelected = selected.includes(lake.id);
          return <LakeRow key={lake.id} lake={lake} selected={isSelected} disabled={full && !isSelected} onPress={() => onToggle(lake.id)} />;
        })}
        {results.length === 0 ? (
          <EmptyState
            icon="search"
            title="No lakes match"
            body={`We don’t cover “${query.trim() || region}” yet. Clear the search, try a nearby region, or request a lake from Profile after setup.`}
            action={<Button variant="secondary" onPress={() => { setQuery(''); setRegion('All'); }}>Clear search</Button>}
          />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: touch.large - 4, paddingHorizontal: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.paper },
  input: { flex: 1, minHeight: touch.comfortable, color: colors.ink, fontSize: 16 },
  clear: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.fog, alignItems: 'center', justifyContent: 'center' },
  filter: { minHeight: 40, paddingHorizontal: spacing.lg, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.paper, justifyContent: 'center' },
  filterActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 68, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  rowSelected: { borderColor: colors.teal, backgroundColor: colors.tealMist },
  lakeIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.tealMist, alignItems: 'center', justifyContent: 'center' },
  check: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: colors.lineStrong, alignItems: 'center', justifyContent: 'center' },
  checkSelected: { backgroundColor: colors.teal, borderColor: colors.teal },
});
