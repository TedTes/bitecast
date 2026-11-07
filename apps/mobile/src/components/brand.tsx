import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { colors, type } from '@/constants/theme';

/**
 * BiteCast mark: a sun breaking the horizon over bathymetric contour rings —
 * “light on the water” drawn the way a lake chart would. Pure Views so it scales
 * crisply at any size without image assets or SVG.
 */
export function BrandMark({ size = 40, tone = 'dark', animateSun = false }: { size?: number; tone?: 'dark' | 'light'; animateSun?: boolean }) {
  const reduced = useReducedMotion();
  const rise = useSharedValue(animateSun && !reduced ? 1 : 0);
  useEffect(() => {
    if (animateSun && !reduced) rise.set(withDelay(250, withTiming(0, { duration: 1100, easing: Easing.out(Easing.cubic) })));
  }, [animateSun, reduced, rise]);
  const sunStyle = useAnimatedStyle(() => ({ transform: [{ translateY: rise.get() * size * 0.34 }] }));
  const bg = tone === 'dark' ? colors.deep : colors.paper;
  const ring = tone === 'dark' ? colors.mint : colors.teal;
  const horizon = size * 0.56;
  const sun = size * 0.34;
  return (
    <View
      style={[styles.mark, { width: size, height: size, borderRadius: size * 0.3, backgroundColor: bg }]}
      accessibilityRole="image"
      accessibilityLabel="BiteCast"
    >
      {/* Sun, clipped by the horizon */}
      <View style={[styles.sunClip, { top: 0, height: horizon, width: size }]}>
        <Animated.View
          style={[sunStyle, {
            position: 'absolute',
            width: sun,
            height: sun,
            borderRadius: sun / 2,
            backgroundColor: colors.sunrise,
            left: size * 0.5 - sun / 2,
            top: horizon - sun * 0.5,
          }]}
        />
      </View>
      {/* Contour rings (below horizon) */}
      <View style={[styles.waterClip, { top: horizon + Math.max(1, size * 0.035), height: size - horizon, width: size }]}>
        {[0.62, 0.92, 1.24].map((scale, index) => (
          <View
            key={scale}
            style={{
              position: 'absolute',
              width: size * scale,
              height: size * scale * 0.55,
              borderRadius: size,
              borderWidth: Math.max(1, size * 0.04),
              borderColor: ring,
              opacity: 1 - index * 0.28,
              left: size * 0.5 - (size * scale) / 2,
              top: -size * scale * 0.2,
            }}
          />
        ))}
      </View>
      <View style={[styles.horizon, { top: horizon, height: Math.max(1, size * 0.035), backgroundColor: ring }]} />
    </View>
  );
}

export function Wordmark({ size = 20, tone = 'dark' }: { size?: number; tone?: 'dark' | 'light' }) {
  return (
    <Text
      style={[styles.word, { fontSize: size, lineHeight: size * 1.2, color: tone === 'dark' ? colors.ink : colors.onDark }]}
      maxFontSizeMultiplier={1.3}
      accessibilityRole="header"
    >
      Bite<Text style={{ color: tone === 'dark' ? colors.teal : colors.mint }}>Cast</Text>
    </Text>
  );
}

export function BrandLockup({ size = 36, tone = 'dark', animateSun }: { size?: number; tone?: 'dark' | 'light'; animateSun?: boolean }) {
  return (
    <View style={styles.lockup} accessible accessibilityLabel="BiteCast">
      <BrandMark size={size} tone={tone === 'dark' ? 'dark' : 'light'} animateSun={animateSun} />
      <Wordmark size={size * 0.6} tone={tone} />
    </View>
  );
}

/**
 * Decorative chart texture (contours + graticule) for dark hero panels. Hidden from
 * screen readers.
 */
export function ChartTexture({ color = colors.deepLine, variant = 'contours' }: { color?: string; variant?: 'contours' | 'grid' }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} importantForAccessibility="no-hide-descendants" aria-hidden>
      {variant === 'contours' &&
        [260, 340, 420, 500].map((width, index) => (
          <View
            key={width}
            style={{
              position: 'absolute',
              width,
              height: width * 0.62,
              borderRadius: width,
              borderWidth: 1,
              borderColor: color,
              right: -width * 0.45,
              bottom: -width * 0.32,
              opacity: 1 - index * 0.18,
              transform: [{ rotate: '-8deg' }],
            }}
          />
        ))}
      {[0.25, 0.5, 0.75].map((position) => (
        <View key={`v${position}`} style={{ position: 'absolute', top: 0, bottom: 0, left: `${position * 100}%`, width: StyleSheet.hairlineWidth, backgroundColor: color, opacity: 0.55 }} />
      ))}
      {[0.33, 0.66].map((position) => (
        <View key={`h${position}`} style={{ position: 'absolute', left: 0, right: 0, top: `${position * 100}%`, height: StyleSheet.hairlineWidth, backgroundColor: color, opacity: 0.55 }} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  mark: { overflow: 'hidden' },
  sunClip: { position: 'absolute', left: 0, overflow: 'hidden' },
  waterClip: { position: 'absolute', left: 0, overflow: 'hidden' },
  horizon: { position: 'absolute', left: '14%', right: '14%', borderRadius: 2 },
  word: { fontFamily: type.title.fontFamily, fontWeight: '700', letterSpacing: -0.2 },
  lockup: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
