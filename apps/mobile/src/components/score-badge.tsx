import { StyleSheet, View } from 'react-native';
import type { Confidence } from '@bitecast/engine';
import { colors, scoreBand, scoreBands } from '@/constants/theme';
import { Row, T } from './ui';

/*
 * The app’s two score styles: the sun or moon on Today, and this round badge everywhere else.
 * The band is always a word as well as a colour.
 */

const sizes = {
  sm: { size: 48, numeral: 17, band: 10, ring: 2 },
  md: { size: 64, numeral: 22, band: 11, ring: 2.5 },
  lg: { size: 92, numeral: 30, band: 12, ring: 3 },
} as const;

type Tone = 'light' | 'dark';

export function ScoreBadge({ score, size = 'sm', caption, tone = 'light' }: { score: number; size?: keyof typeof sizes; /** What the number is (Peak, Block, Now). Shown at `lg`, always spoken. */ caption?: string; tone?: Tone }) {
  const band = scoreBands[scoreBand(score)];
  const s = sizes[size];
  const dark = tone === 'dark';
  // Band colours are too light for small text on their tints, so the colour lives in the ring.
  const ink = dark ? colors.white : colors.ink;
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${caption ? `${caption} bite` : 'Bite'} score ${score} out of 100, ${band.label}`}
      style={[styles.badge, { width: s.size, height: s.size, borderRadius: s.size / 2, borderWidth: s.ring, borderColor: dark ? band.onDark : band.color, backgroundColor: dark ? 'rgba(0,0,0,0.25)' : band.tint }]}
    >
      {caption && size === 'lg' ? <T variant="caption" color={ink} maxFontSizeMultiplier={1.1} style={styles.caption}>{caption === 'Block' ? 'Score' : caption}</T> : null}
      <T variant="numeralS" color={ink} maxFontSizeMultiplier={1.15} style={{ fontSize: s.numeral, lineHeight: s.numeral * 1.15 }}>{score}</T>
      <T variant="caption" weight="600" color={ink} maxFontSizeMultiplier={1.1} style={{ fontSize: s.band, lineHeight: s.band * 1.2 }}>{band.label}</T>
    </View>
  );
}

const barLevel: Record<Confidence, number> = { High: 3, Medium: 2, Low: 1 };
const help: Record<Confidence, string> = {
  High: 'Fresh weather data and a known lake profile.',
  Medium: 'Some inputs are estimated, such as lake clarity.',
  Low: 'Older weather data or far-ahead hours. Treat as a rough guide.',
};

/** The app’s one confidence indicator: three bars, plus the level unless `bare` (then spoken only). */
export function ConfidenceBars({ level, bare, long, explain, tone = 'light' }: { level: Confidence; bare?: boolean; /** “Low confidence” instead of “Low”. */ long?: boolean; /** Adds a sentence on what the level means. */ explain?: boolean; tone?: Tone }) {
  const dark = tone === 'dark';
  const on = dark ? colors.mint : colors.teal;
  const off = dark ? 'rgba(255,255,255,0.3)' : colors.fogDeep;
  const meter = (
    <Row gap={5} accessible accessibilityLabel={`${level} confidence`}>
      <View style={styles.bars} importantForAccessibility="no-hide-descendants">
        {[1, 2, 3].map((bar) => <View key={bar} style={[styles.bar, { height: 3 + bar * 3, backgroundColor: bar <= barLevel[level] ? on : off }]} />)}
      </View>
      {bare ? null : <T variant="caption" color={dark ? colors.white : colors.inkMuted}>{long ? `${level} confidence` : level}</T>}
    </Row>
  );
  if (!explain) return meter;
  return (
    <View style={{ gap: 4 }}>
      {meter}
      <T variant="caption" color={dark ? colors.onDarkMuted : colors.inkMuted}>{help[level]}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignItems: 'center', justifyContent: 'center' },
  caption: { fontSize: 10.5, lineHeight: 12 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  bar: { width: 3, borderRadius: 1 },
});
