import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { colors, radius, spacing } from '@/constants/theme';
import { IconButton, Row, T } from './ui';

/** Back affordance + segmented progress for the three onboarding steps. */
export function StepHeader({ step, total = 3 }: { step: number; total?: number }) {
  return (
    <Row gap={spacing.md}>
      <IconButton icon="back" label="Back" onPress={() => router.back()} tone="clear" />
      <View
        style={styles.track}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={`Step ${step} of ${total}`}
        accessibilityValue={{ min: 1, max: total, now: step }}
      >
        {Array.from({ length: total }, (_, index) => (
          <View key={index} style={[styles.segment, { backgroundColor: index < step ? colors.teal : colors.fogDeep }]} />
        ))}
      </View>
      <T variant="caption" weight="700" color={colors.inkMuted} importantForAccessibility="no">{step}/{total}</T>
    </Row>
  );
}

const styles = StyleSheet.create({
  track: { flex: 1, flexDirection: 'row', gap: 4 },
  segment: { flex: 1, height: 4, borderRadius: radius.pill },
});
