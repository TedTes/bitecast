import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { useLiveSky } from '@/features/live-sky';
import { seeded, tabBed } from '@/features/sky';

/*
 * The tab bar is the bottom of the lake on every tab: sky at the top of the screen, silt at the
 * bottom. It starts in exactly the colour Today’s bed ends in, so there the two read as one.
 */

/** Height of the silt’s uneven edge, drawn just above the bar. */
const EDGE = 7;

export function LakeBedBar() {
  const { palette } = useLiveSky();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const { width, height } = size;
  const bed = tabBed(palette);
  const random = seeded(149);
  let grains = '';
  for (let i = 0; i < 90; i += 1) grains += `M${random() * width} ${EDGE + random() * height} h${0.3 + random()} `;
  return (
    <View
      style={StyleSheet.absoluteFill}
      onLayout={({ nativeEvent: { layout } }) => setSize({ width: layout.width, height: layout.height })}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {/* A solid fill first, so there is never an unpainted frame or seam */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: bed.top }]} />
      {width ? (
        <Svg width={width} height={height + EDGE} style={styles.bed}>
          <Defs>
            <LinearGradient id="tabSilt" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={bed.top} />
              <Stop offset="1" stopColor={bed.bottom} />
            </LinearGradient>
          </Defs>
          <Path d={`M0 4 C${width * 0.14} 0 ${width * 0.3} 6 ${width * 0.46} 4 S${width * 0.8} 1 ${width} 3 V${EDGE + 1} H0 Z`} fill={bed.top} />
          <Rect y={EDGE} width={width} height={height} fill="url(#tabSilt)" />
          <Path d={grains} stroke={bed.grain} strokeWidth={1.3} opacity={0.6} />
        </Svg>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bed: { position: 'absolute', left: 0, top: -EDGE },
});
