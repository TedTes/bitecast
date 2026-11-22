import { useCallback, useState, type ReactNode } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { colors, spacing, touch } from '@/constants/theme';
import { useLiveSky, type SceneSky } from '@/features/live-sky';
import { onScene, orbElevation, seeded } from '@/features/sky';
import { Icon } from './icon';
import { ridgePath, treesPath } from './lake-scene';
import { Row, T } from './ui';
import { wavePath } from './waterline';

/*
 * Today’s family feature on the calm screens: a short, still strip of the same live sky, treeline
 * and waterline behind a large title. Text stays in the dark upper sky, where sky.test.ts
 * guarantees contrast; the bright horizon only begins below it.
 */

/** Scenery below the text. */
const SHORELINE = 44;
/** Water between the horizon and the page. */
const WATER = 14;

type Props = {
  title: string;
  subtitle?: string;
  /** Beside the title, or beside the back button when there is one. */
  right?: ReactNode;
  /** The page colour the wave runs into; null where the water meets the content directly (the map). */
  page?: string | null;
};

/** For tab screens: lit by the same lake as Today. */
export function ShorelineHeader(props: Props) {
  const sky = useLiveSky();
  return <Shoreline {...props} sky={sky} />;
}

export function Shoreline({ title, subtitle, right, back, sky, page = colors.cream }: Props & { back?: boolean; sky: SceneSky }) {
  const insets = useSafeAreaInsets();
  const [size, setSize] = useState({ width: 0, height: 0 });
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      return () => setStatusBarStyle('dark');
    }, []),
  );
  return (
    <View style={{ backgroundColor: sky.palette.upper }} onLayout={({ nativeEvent: { layout } }) => setSize({ width: layout.width, height: layout.height })}>
      {size.width ? <Scenery {...size} sky={sky} page={page} /> : null}
      {/* Covers the sub-pixel sliver of sky colour under the drawing */}
      <View style={[styles.seam, { backgroundColor: page ?? sky.palette.surfaceNear }]} />
      <View style={[styles.content, { paddingTop: insets.top }]}>
        {back ? (
          <Row justify="space-between" style={styles.nav}>
            <Pressable
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/today'))}
              accessibilityRole="button"
              accessibilityLabel="Back"
              style={({ pressed }) => [styles.back, pressed && { opacity: 0.7 }]}
            >
              <Icon name="back" size={18} color={onScene.text} />
            </Pressable>
            {right}
          </Row>
        ) : null}
        <Row gap={spacing.md} style={styles.titleRow}>
          <T variant="display" color={onScene.text} accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={{ flex: 1 }}>{title}</T>
          {back ? null : right}
        </Row>
        {subtitle ? <T variant="caption" color={onScene.text}>{subtitle}</T> : null}
      </View>
      <View style={{ height: SHORELINE }} />
    </View>
  );
}

function Scenery({ width, height, page, sky: { palette, altitude, weather, ice } }: { width: number; height: number; page: string | null; sky: SceneSky }) {
  const horizon = height - WATER;
  const textEnd = Math.max(0, height - SHORELINE) / horizon;
  const orb = { x: width * 0.78, y: horizon - 13 - orbElevation(altitude) * 10 };
  const random = seeded(131);
  const stars = Array.from({ length: 28 }, () => ({ x: random() * width, y: random() * (horizon - 24), r: 0.4 + random() * 0.6 }));
  let ripples = '';
  for (let i = 0; i < 26 + Math.min(30, weather.windKmh); i += 1) ripples += `M${random() * width} ${horizon + 2 + random() * (WATER - 6)} h${3 + random() * 10} `;
  let glitter = '';
  for (let i = 0; i < 12; i += 1) glitter += `M${orb.x - 12 + random() * 20} ${horizon + 1.5 + random() * (WATER - 6)} h${3 + random() * 5} `;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="shoreSky" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={palette.top} />
            <Stop offset={textEnd} stopColor={palette.upper} />
            <Stop offset={textEnd + (1 - textEnd) * 0.45} stopColor={palette.mid} />
            <Stop offset="1" stopColor={palette.low} />
          </LinearGradient>
          <LinearGradient id="shoreWater" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={palette.surfaceFar} />
            <Stop offset="1" stopColor={palette.surfaceNear} />
          </LinearGradient>
          <RadialGradient id="shoreGlow">
            <Stop offset="0" stopColor={palette.orb.glow} stopOpacity={0.5} />
            <Stop offset="1" stopColor={palette.orb.glow} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width={width} height={horizon} fill="url(#shoreSky)" />
        {palette.stars > 0 ? stars.map((star, i) => <Circle key={i} cx={star.x} cy={star.y} r={star.r} fill="#FFFFFF" opacity={palette.stars * 0.6} />) : null}
        <Circle cx={orb.x} cy={orb.y} r={24} fill="url(#shoreGlow)" />
        {/* After sunset only the glow is left */}
        {palette.phase === 'afterglow' ? null : <Circle cx={orb.x} cy={orb.y} r={8} fill={palette.orb.core} />}
        <Path d={ridgePath(width, horizon - 1, 10, 5)} fill={palette.farShore} />
        <Path d={treesPath(width, horizon - 1, 0.5)} fill={palette.nearShore} />
        <Rect y={horizon} width={width} height={WATER} fill="url(#shoreWater)" />
        <Path d={ripples} stroke={palette.cloudLight} strokeWidth={0.8} opacity={0.4} />
        {ice || palette.phase === 'afterglow' ? null : <Path d={glitter} stroke={palette.orb.edge} strokeWidth={1} opacity={0.8} />}
        {/* The page begins at the water’s edge */}
        {page ? <Path d={`${wavePath(width, height - 3)} V${height} H0 Z`} fill={page} /> : null}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.xl, width: '100%', maxWidth: 640, alignSelf: 'center' },
  nav: { minHeight: touch.min },
  back: { width: touch.min, height: touch.min, borderRadius: touch.min / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: onScene.glass, borderWidth: 1, borderColor: onScene.glassLine },
  titleRow: { minHeight: touch.min },
  seam: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 1 },
});
