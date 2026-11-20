import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, type IconName } from '@/components/icon';
import { StepHeader } from '@/components/onboarding';
import { Button, IceSafetyNotice, PageHeader, Reveal, Row, Screen, T } from '@/components/ui';
import { colors, elevation, radius, spacing } from '@/constants/theme';
import { haptic } from '@/lib/haptics';
import { useAppStore } from '@/store/use-app-store';

const options: { value: boolean; icon: IconName; title: string; body: string; details: string[] }[] = [
  { value: false, icon: 'open-water', title: 'Open water only', body: 'Boat or shore, all year', details: ['Jig, troll or cast tactics', 'Every lake uses open-water conditions'] },
  { value: true, icon: 'ice', title: 'Open water and ice', body: 'I also fish through the ice', details: ['Lakes switch to ice mode when they typically freeze', 'Change any lake by hand from its forecast'] },
];

export default function SeasonScreen() {
  const iceFishing = useAppStore((state) => state.settings.iceFishing);
  const setIceFishing = useAppStore((state) => state.setIceFishing);
  return (
    <Screen
      footer={
        <>
          {/* Pinned in the footer so it is always on screen, even on the smallest phones. */}
          {iceFishing ? (
            <Reveal>
              <IceSafetyNotice />
            </Reveal>
          ) : null}
          <Button iconRight="chevron-right" onPress={() => router.push('/(onboarding)/lakes')}>Choose my lakes</Button>
        </>
      }
    >
      <StepHeader step={1} />
      <PageHeader title="Do you fish through the ice?" lede="Each lake is forecast for its own conditions — open water or ice. This sets how lakes start out; you can change any lake later." />
      <View style={{ gap: spacing.md }} accessibilityRole="radiogroup" accessibilityLabel="Ice fishing">
        {options.map((option) => {
          const active = iceFishing === option.value;
          return (
            <Pressable
              key={String(option.value)}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              accessibilityLabel={`${option.title}. ${option.body}. ${option.details.join('. ')}`}
              onPress={() => {
                if (!active) haptic.select();
                setIceFishing(option.value);
              }}
              style={({ pressed }) => [styles.option, active && styles.optionActive, pressed && { opacity: 0.9 }]}
            >
              <View style={[styles.optionIcon, active && { backgroundColor: colors.teal }]}>
                <Icon name={option.icon} size={26} color={active ? colors.onDark : colors.teal} />
              </View>
              <View style={{ flex: 1, gap: spacing.xs }}>
                <T variant="headline">{option.title}</T>
                <T variant="callout" color={colors.inkMuted}>{option.body}</T>
                <View style={{ gap: 2, marginTop: spacing.xs }}>
                  {option.details.map((detail) => (
                    <Row key={detail} gap={6}>
                      <Icon name="check" size={12} color={colors.teal} />
                      <T variant="caption" color={colors.inkSoft}>{detail}</T>
                    </Row>
                  ))}
                </View>
              </View>
              <View style={[styles.radio, active && styles.radioActive]}>{active ? <View style={styles.radioDot} /> : null}</View>
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  option: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg, backgroundColor: colors.paper, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.line, padding: spacing.lg },
  optionActive: { borderColor: colors.teal, backgroundColor: colors.white, ...elevation.raised },
  optionIcon: { width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.tealMist, alignItems: 'center', justifyContent: 'center' },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.lineStrong, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  radioActive: { borderColor: colors.teal },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.teal },
});
