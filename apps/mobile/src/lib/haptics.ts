import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/** Restrained tactile feedback. All calls are fire-and-forget and no-op on web. */
const run = (fn: () => Promise<void>) => {
  if (Platform.OS === 'web') return;
  fn().catch(() => undefined);
};

export const haptic = {
  select: () => run(() => Haptics.selectionAsync()),
  tap: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  success: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
