import { useEffect } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { colors } from '@/constants/theme';

/**
 * Original code-native walleye illustration (side profile, facing right), drawn as a
 * field-guide line study: twin dorsal fins with the dark rear spot, large glassy eye,
 * forked tail with the white lower tip, and faint saddle bars.
 */
export function WalleyeArt({ width = 240, tone = 'dark', contours = true }: { width?: number; tone?: 'dark' | 'light'; contours?: boolean }) {
  const stroke = tone === 'dark' ? colors.mint : colors.teal;
  const body = tone === 'dark' ? colors.deepRaised : colors.tealMist;
  const detail = tone === 'dark' ? colors.onDarkFaint : colors.chartContour;
  const eye = tone === 'dark' ? colors.sunrise : colors.sunriseInk;
  const height = (width * 110) / 240;
  return (
    <Svg width={width} height={height} viewBox="0 0 240 110" accessibilityLabel="Walleye illustration" role="img">
      {contours ? (
        <G opacity={0.55}>
          <Path d="M0 96 C40 88 80 102 120 94 C160 86 200 100 240 92" stroke={detail} strokeWidth={1} fill="none" />
          <Path d="M0 104 C50 98 90 110 130 103 C170 96 210 108 240 101" stroke={detail} strokeWidth={1} fill="none" opacity={0.7} />
        </G>
      ) : null}
      {/* Fins behind the body */}
      <Path d="M160 31 L156 13 L150 17 L144 11 L138 16 L132 12 L126 17 L120 14 L115 32 Z" fill={body} stroke={stroke} strokeWidth={1.4} strokeLinejoin="round" />
      <Path d="M150 17 L148 31 M144 11 L141 31 M138 16 L135 31 M132 12 L129 32 M126 17 L123 32" stroke={detail} strokeWidth={0.9} />
      <Circle cx={121} cy={24} r={3.2} fill={stroke} opacity={0.85} />
      <Path d="M106 34 C103 22 88 19 76 26 L72 40 Z" fill={body} stroke={stroke} strokeWidth={1.4} strokeLinejoin="round" />
      <Path d="M94 66 C88 78 76 80 67 75 L63 62 Z" fill={body} stroke={stroke} strokeWidth={1.4} strokeLinejoin="round" />
      <Path d="M160 66 L149 80 L145 67 Z" fill={body} stroke={stroke} strokeWidth={1.3} strokeLinejoin="round" />
      {/* Tail */}
      <Path d="M42 48 L16 28 C10 40 10 60 16 74 L42 56 Z" fill={body} stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" />
      <Path d="M16 74 C14 69 13 66 13 62 L22 67 Z" fill={colors.onDark} opacity={0.9} />
      <Path d="M40 50 L20 38 M40 52 L16 50 M40 54 L20 64" stroke={detail} strokeWidth={0.8} />
      {/* Body */}
      <Path
        d="M226 51 C214 37 188 29 160 29 C128 29 96 33 70 40 C56 43 47 46 41 48 L41 56 C51 59 71 65 100 67 C140 69 180 69 205 63 C216 60 223 56 226 52 Z"
        fill={body}
        stroke={stroke}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      {/* Saddle bars */}
      <Path d="M148 31 L144 44 M128 32 L125 45 M106 35 L104 47 M86 38 L85 49 M66 42 L66 51" stroke={detail} strokeWidth={2.2} strokeLinecap="round" opacity={0.6} />
      {/* Lateral line, gill cover, mouth, pectoral */}
      <Path d="M190 45 C150 43 100 47 46 51" stroke={detail} strokeWidth={0.9} strokeDasharray="3 3" fill="none" />
      <Path d="M193 33 C184 43 184 56 193 64" stroke={stroke} strokeWidth={1.3} fill="none" />
      <Path d="M226 52 L211 55" stroke={stroke} strokeWidth={1.3} strokeLinecap="round" />
      <Path d="M184 55 C173 58 166 64 162 71 C172 67 180 63 186 59 Z" fill={body} stroke={stroke} strokeWidth={1.2} strokeLinejoin="round" />
      {/* Glassy eye */}
      <Circle cx={206} cy={44} r={6} fill={colors.deep} stroke={stroke} strokeWidth={1.3} />
      <Circle cx={206} cy={44} r={3.2} fill={eye} opacity={0.9} />
      <Circle cx={207.6} cy={42.4} r={1.1} fill={colors.onDark} />
    </Svg>
  );
}

/** The illustration with a slow, small drift — like a fish holding in current. Static under reduce motion. */
export function SwimmingWalleye({ width = 240, tone = 'dark', style }: { width?: number; tone?: 'dark' | 'light'; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const drift = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    drift.set(withRepeat(withSequence(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: 2600, easing: Easing.inOut(Easing.sin) })), -1));
  }, [drift, reduced]);
  const animated = useAnimatedStyle(() => ({
    transform: [{ translateX: drift.get() * 6 - 3 }, { translateY: drift.get() * -3 }, { rotate: `${drift.get() * 1.2 - 0.6}deg` }],
  }));
  return (
    <View style={style} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Animated.View style={animated}>
        <WalleyeArt width={width} tone={tone} />
      </Animated.View>
    </View>
  );
}
