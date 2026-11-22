import { useState } from 'react';
import { Pressable, StyleSheet, View, type GestureResponderEvent } from 'react-native';
import * as SunCalc from 'suncalc';
import { colors, hitSlop, radius, spacing, touch } from '@/constants/theme';
import { skyPhase, type SkyPhase } from '@/features/sky';
import { shortClock, startOfDay } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { Icon } from './icon';
import { Row, T } from './ui';

/*
 * Development-only control (long-press the Today title) that scrubs the sky through today.
 * It moves the light only: forecasts, countdowns and the clock stay on real time.
 */

const DAY = 24 * 60;
const STEP = 5;
const MINUTE = 60_000;
const phaseLabel: Record<SkyPhase, string> = { sun: 'Sun', afterglow: 'Sun below horizon', moon: 'Moon' };

type Props = {
  now: number;
  /** The previewed time, or null while following the clock. */
  value: number | null;
  latitude: number;
  longitude: number;
  onChange: (time: number | null) => void;
  onClose: () => void;
};

export function SkyPreview({ now, value, latitude, longitude, onChange, onClose }: Props) {
  const [width, setWidth] = useState(0);
  const start = startOfDay(new Date(now)).getTime();
  const time = value ?? now;
  const minute = Math.min(DAY, Math.max(0, (time - start) / MINUTE));
  const phase = skyPhase(SunCalc.getPosition(new Date(time), latitude, longitude).altitude);
  const { sunrise, sunset } = SunCalc.getTimes(new Date(start + (DAY / 2) * MINUTE), latitude, longitude);
  const events = [sunrise, sunset].filter((event): event is Date => event !== null);

  const seek = (next: number) => {
    const snapped = start + Math.min(DAY - STEP, Math.max(0, Math.round(next / STEP) * STEP)) * MINUTE;
    if (snapped !== value) onChange(snapped);
  };
  const drag = (event: GestureResponderEvent) => {
    if (width) seek((event.nativeEvent.locationX / width) * DAY);
  };

  return (
    <View style={styles.panel}>
      <Row gap={spacing.md} align="center">
        <View style={{ flex: 1 }}>
          <T variant="label" color={colors.onDark}>{shortClock(new Date(time))} · {phaseLabel[phase]}</T>
          <T variant="caption" color={colors.onDarkMuted}>
            Sky preview{events.length === 2 ? ` · sun ${shortClock(events[0])} to ${shortClock(events[1])}` : ''}
          </T>
        </View>
        {value === null ? null : (
          <Pressable onPress={() => { haptic.select(); onChange(null); }} hitSlop={hitSlop} accessibilityRole="button">
            <T variant="label" color={colors.mint}>Now</T>
          </Pressable>
        )}
        <Pressable onPress={onClose} hitSlop={hitSlop} accessibilityRole="button" accessibilityLabel="Close sky preview">
          <Icon name="close" size={16} color={colors.onDark} />
        </Pressable>
      </Row>
      <View
        style={styles.track}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={drag}
        onResponderMove={drag}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Sky preview time"
        accessibilityValue={{ text: shortClock(new Date(time)) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(event) => seek(minute + (event.nativeEvent.actionName === 'increment' ? 30 : -30))}
      >
        {/* Children ignore touches, so locationX is always measured from the track. */}
        <View pointerEvents="none" style={styles.line} />
        {events.map((event) => (
          <View key={event.getTime()} pointerEvents="none" style={[styles.tick, { left: ((event.getTime() - start) / MINUTE / DAY) * width }]} />
        ))}
        <View pointerEvents="none" style={[styles.thumb, { left: (minute / DAY) * width - THUMB / 2 }]} />
      </View>
    </View>
  );
}

const THUMB = 24;

const styles = StyleSheet.create({
  // Clears the raised + button on the tab bar.
  panel: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: 32, paddingHorizontal: spacing.xl, paddingTop: spacing.md, borderRadius: radius.lg, backgroundColor: colors.deep },
  track: { height: touch.comfortable, justifyContent: 'center' },
  line: { height: 4, borderRadius: 2, backgroundColor: colors.deepLine },
  tick: { position: 'absolute', width: 2, height: 14, backgroundColor: colors.sunrise },
  thumb: { position: 'absolute', width: THUMB, height: THUMB, borderRadius: THUMB / 2, backgroundColor: colors.onDark },
});
