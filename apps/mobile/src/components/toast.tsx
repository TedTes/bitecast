import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, elevation, hitSlop, radius, spacing } from '@/constants/theme';
import { Icon, type IconName } from './icon';
import { T } from './ui';

/**
 * Transient top toast. Shows whenever `trigger` changes to a new non-zero value (e.g. an
 * error timestamp), then hides itself after `duration`. Render it as a sibling of <Screen>
 * inside a flex:1 container so it floats over the content.
 */
export function Toast({
  trigger,
  message,
  icon = 'info',
  actionLabel,
  onAction,
  duration = 4000,
}: {
  trigger: number;
  message: string;
  icon?: IconName;
  actionLabel?: string;
  onAction?: () => void;
  duration?: number;
}) {
  const insets = useSafeAreaInsets();
  const [dismissed, setDismissed] = useState(0);
  const visible = trigger > 0 && trigger !== dismissed;

  useEffect(() => {
    if (!trigger) return;
    const timer = setTimeout(() => setDismissed(trigger), duration);
    return () => clearTimeout(timer);
  }, [trigger, duration]);

  if (!visible) return null;
  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { paddingTop: insets.top + spacing.sm }]}>
      <Animated.View entering={FadeInUp.duration(220)} exiting={FadeOutUp.duration(200)} style={styles.toast} accessibilityRole="alert" accessibilityLiveRegion="polite">
        <Icon name={icon} size={16} color={colors.onDark} />
        <T variant="callout" color={colors.onDark} style={{ flex: 1 }} numberOfLines={2}>{message}</T>
        {actionLabel && onAction ? (
          <Pressable
            onPress={() => {
              setDismissed(trigger);
              onAction();
            }}
            hitSlop={hitSlop}
            accessibilityRole="button"
            style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}
          >
            <T variant="callout" weight="700" color={colors.mint}>{actionLabel}</T>
          </Pressable>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  toast: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: spacing.lg, paddingVertical: spacing.sm + 2, paddingLeft: spacing.lg, paddingRight: spacing.sm, borderRadius: radius.md, backgroundColor: colors.deep, ...elevation.raised },
  action: { paddingHorizontal: spacing.md, minHeight: 36, justifyContent: 'center' },
});
