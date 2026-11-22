import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { useLiveSky } from '@/features/live-sky';
import { tabWater } from '@/features/sky';
import { wavePath } from './waterline';

/*
 * The tab bar is deep water on every tab: the same teal as the app’s dark cards and buttons, and
 * the same wave as the shoreline header, so water frames the page at both ends. On Today the
 * lake bed already sinks into that colour, so there the bar has no edge of its own.
 */

/** Height of the wave drawn just above the bar. */
const EDGE = 7;

export function DeepWaterBar({ edge = true }: { edge?: boolean }) {
  const { palette } = useLiveSky();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const { width, height } = size;
  const water = tabWater(palette);
  return (
    <View
      style={StyleSheet.absoluteFill}
      onLayout={({ nativeEvent: { layout } }) => setSize({ width: layout.width, height: layout.height })}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {/* A solid fill first, so there is never an unpainted frame or seam */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: water.top }]} />
      {width ? (
        <Svg width={width} height={height + EDGE} style={styles.water}>
          <Defs>
            <LinearGradient id="tabWater" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={water.top} />
              <Stop offset="1" stopColor={water.bottom} />
            </LinearGradient>
          </Defs>
          <Rect y={EDGE} width={width} height={height} fill="url(#tabWater)" />
          {edge ? (
            <>
              <Path d={`${wavePath(width, EDGE - 3)} V${EDGE + 1} H0 Z`} fill={water.top} />
              <Path d={wavePath(width, EDGE - 3)} stroke={palette.surfaceNear} strokeWidth={1} fill="none" />
            </>
          ) : null}
        </Svg>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  water: { position: 'absolute', left: 0, top: -EDGE },
});
