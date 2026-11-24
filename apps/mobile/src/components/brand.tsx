import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import { colors, wordmarkFont } from '@/constants/theme';

const markLarge = require('../../assets/images/brand-mark.png');
const markSmall = require('../../assets/images/brand-mark-small.png');

/**
 * The bite clock: a fish leaping at a lure inside a dial, with the orange arc
 * as the bite window. Below 64pt the ticks, line and lure drop out so the mark
 * still reads; the art is rendered to PNG from the logo concept.
 */
export function BrandMark({ size = 40 }: { size?: number }) {
  return (
    <Image
      source={size < 64 ? markSmall : markLarge}
      style={{ width: size, height: size, borderRadius: size * 0.22 }}
      contentFit="cover"
      accessible
      accessibilityRole="image"
      accessibilityLabel="DawnBite"
    />
  );
}

export function Wordmark({ size = 20, tone = 'dark' }: { size?: number; tone?: 'dark' | 'light' }) {
  return (
    <Text
      style={[styles.word, { fontSize: size, lineHeight: size * 1.2, color: tone === 'dark' ? colors.ink : colors.onDark }]}
      maxFontSizeMultiplier={1.3}
      accessibilityRole="header"
    >
      Dawn<Text style={{ color: tone === 'dark' ? colors.teal : colors.mint }}>Bite</Text>
    </Text>
  );
}

export function BrandLockup({ size = 36, tone = 'dark' }: { size?: number; tone?: 'dark' | 'light' }) {
  return (
    <View style={styles.lockup} accessible accessibilityLabel="DawnBite">
      <BrandMark size={size} />
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
  word: { fontFamily: wordmarkFont, fontWeight: '700', letterSpacing: -0.2 },
  lockup: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
