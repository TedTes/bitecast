import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import type { Confidence } from '@bitecast/engine';
import { colors, scoreBand, scoreBands } from '@/constants/theme';
import { Row, T } from './ui';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Circular score gauge in the band colour; sweeps in on appear (static under reduce motion). */
export function ScoreRing({ score, caption, size = 92 }: { score: number; caption: string; size?: number }) {
  const band = scoreBands[scoreBand(score)];
  const stroke = Math.round(size * 0.087);
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const reduced = useReducedMotion();
  const progress = useSharedValue(reduced ? score / 100 : 0);
  useEffect(() => {
    progress.set(withTiming(score / 100, { duration: reduced ? 0 : 800, easing: Easing.out(Easing.cubic) }));
  }, [score, reduced, progress]);
  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: circumference * (1 - progress.get()) }));
  return (
    <View
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${caption} bite score ${score} out of 100, ${band.label}`}
    >
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.fog} strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={band.color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          animatedProps={animatedProps}
          fill="none"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <T variant="label" color={colors.inkMuted} style={{ fontSize: 10, lineHeight: 12 }}>{caption}</T>
      <T variant="numeralL" style={{ lineHeight: 36 }}>{score}</T>
      <T variant="caption" weight="800" color={band.color} style={{ fontSize: 11, lineHeight: 13 }}>{band.label}</T>
    </View>
  );
}

const barLevel: Record<Confidence, number> = { High: 3, Medium: 2, Low: 1 };

/** Compact confidence: three bars, plus the level word unless `bare` (then it is in the a11y label). */
export function ConfidenceBars({ level, bare, long, tone = 'light' }: { level: Confidence; bare?: boolean; /** “Low confidence” instead of “Low”. */ long?: boolean; tone?: 'light' | 'dark' }) {
  const dark = tone === 'dark';
  const on = dark ? colors.mint : colors.teal;
  const off = dark ? 'rgba(255,255,255,0.3)' : colors.fogDeep;
  return (
    <Row gap={4} accessible={bare} accessibilityLabel={bare ? `${level} confidence` : undefined}>
      <View style={styles.bars} importantForAccessibility="no-hide-descendants">
        {[1, 2, 3].map((bar) => <View key={bar} style={[styles.bar, { height: 3 + bar * 3, backgroundColor: bar <= barLevel[level] ? on : off }]} />)}
      </View>
      {bare ? null : <T variant="caption" color={dark ? colors.white : colors.inkMuted}>{long ? `${level} confidence` : level}</T>}
    </Row>
  );
}

/** Small score tile (number + band word on the band tint), for list rows. */
export function ScoreTile({ score, size = 52 }: { score: number; size?: number }) {
  const band = scoreBands[scoreBand(score)];
  return (
    <View style={[styles.tile, { width: size, height: size, backgroundColor: band.tint, borderColor: band.color }]} importantForAccessibility="no-hide-descendants">
      <T variant="numeralM" color={colors.ink} style={{ fontSize: size * 0.4, lineHeight: size * 0.46 }}>{score}</T>
      <T variant="caption" weight="800" color={band.color} style={{ fontSize: 10, lineHeight: 12 }}>{band.label}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  bar: { width: 3, borderRadius: 1 },
  tile: { borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
