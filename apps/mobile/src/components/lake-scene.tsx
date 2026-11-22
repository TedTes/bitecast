import { useEffect } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withTiming, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { mix, moonShadowPath, orbElevation, seeded, type SkyPalette } from '@/features/sky';
import { LakeSchool, type Mood } from './lake-school';

/*
 * Naturalistic lake cross-section behind Today: sky → far shores and treeline → water
 * surface → underwater → silt bed. It scrolls with the content, so the sun, shoreline
 * timeline and cards stay aligned. Decorative: hidden from screen readers.
 */

/** Open sky reserved above the horizon for the sun or moon. */
export const SKY_SPACE = 160;
/** Dark shore at the horizon that carries the timeline labels. */
export const SHORE = 26;
/** Visible water surface between the horizon and the waterline. */
export const SURFACE = 44;
/** Minimum open water and bed kept below the last card. */
export const LAKE_FLOOR = 108;
export const ORB = 116;

/** Top of the sun or moon inside the sky space. */
export const orbTop = (altitude: number) => 22 - 16 * orbElevation(altitude);

export type SceneWeather = { cloudPct: number; windKmh: number; rainMm: number };

type SceneProps = {
  width: number;
  height: number;
  headerBottom: number;
  horizon: number;
  contentBottom: number;
  altitude: number;
  palette: SkyPalette;
  weather: SceneWeather;
  moon: { fraction: number; waxing: boolean };
  ice: boolean;
  mood: Mood;
  active: boolean;
  scrollY: SharedValue<number>;
};

export function LakeScene({ width, height, headerBottom, horizon, contentBottom, altitude, palette, weather, moon, ice, mood, active, scrollY }: SceneProps) {
  const waterline = horizon + SURFACE;
  const orb = { x: width / 2, y: horizon - SKY_SPACE + orbTop(altitude) + ORB / 2 };
  // Fish roam the whole water column, passing behind the cards.
  const fishTop = waterline + 8;
  const fishBottom = height - 42;
  // Open water between the last card and the bed, which has its own resident school.
  const openTop = Math.max(waterline + 16, contentBottom + 4);
  const bedBottom = height - 28;
  return (
    <View pointerEvents="none" style={[styles.scene, { width, height }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Sky width={width} horizon={horizon} palette={palette} />
      <Clouds width={width} top={Math.max(headerBottom, horizon - SKY_SPACE)} horizon={horizon} palette={palette} weather={weather} active={active} scrollY={scrollY} />
      <Orb width={width} horizon={horizon} {...orb} palette={palette} moon={moon} />
      <Shore width={width} horizon={horizon} palette={palette} birds={!palette.night && weather.cloudPct < 85 && weather.rainMm < 0.2} />
      <Surface width={width} horizon={horizon} palette={palette} windKmh={weather.windKmh} ice={ice} />
      {ice || palette.haze > 0.7 || palette.phase === 'afterglow' ? null : <Glitter width={width} top={horizon} color={palette.orb.edge} active={active} />}
      <Underwater width={width} top={waterline} height={height - waterline} palette={palette} />
      <LightShafts width={width} top={waterline} height={height - waterline} strength={palette.daylight * (1 - palette.haze * 0.6)} active={active} />
      <Particles width={width} top={fishTop} height={Math.max(0, fishBottom - fishTop)} active={active} />
      <Bed width={width} top={height - 74} palette={palette} />
      <Weeds width={width} color={palette.weed} active={active} />
      <Bubbles width={width} active={active} />
      {fishBottom - fishTop > 30 ? (
        // The count is fixed: the score changes how lively fish are, never how many there are.
        <LakeSchool key={`${width}:${Math.round(fishTop / 24)}:${Math.round(fishBottom / 24)}`} width={width} top={fishTop} bottom={fishBottom} mood={mood} count={9} sizeScale={1.25} visibility={1.3} active={active} />
      ) : null}
      {bedBottom - openTop > 30 ? (
        <LakeSchool key={`bed:${width}:${Math.round(openTop / 24)}:${Math.round(bedBottom / 24)}`} width={width} top={openTop} bottom={bedBottom} mood={mood} count={9} sizeScale={1.05} visibility={1.3} active={active} />
      ) : null}
      {ice ? null : <Bobber x={width - 30} waterline={waterline} lineEnd={openTop + 18} windKmh={weather.windKmh} active={active} />}
      {weather.rainMm >= 0.2 ? <Rain width={width} height={waterline} heavy={weather.rainMm >= 2} active={active} /> : null}
    </View>
  );
}

/** A 0→1 loop that stops while Today is out of focus or Reduce Motion is on. */
function useLoop(active: boolean, duration: number, { reverse = true, delay = 0 } = {}) {
  const reduced = useReducedMotion();
  const value = useSharedValue(0);
  useEffect(() => {
    if (!active || reduced) return;
    value.set(0);
    const easing = reverse ? Easing.inOut(Easing.sin) : Easing.linear;
    value.set(withDelay(delay, withRepeat(withTiming(1, { duration, easing }), -1, reverse)));
    return () => cancelAnimation(value);
  }, [active, reduced, value, duration, reverse, delay]);
  return value;
}

const at = (left: number, top: number): ViewStyle => ({ position: 'absolute', left, top });

/* ───────────── Above the water ───────────── */

function Sky({ width, horizon, palette }: { width: number; horizon: number; palette: SkyPalette }) {
  const random = seeded(11);
  const stars = Array.from({ length: 70 }, () => ({ x: random() * width, y: random() ** 1.4 * (horizon - 50), r: 0.4 + random() ** 3 * 1.1, o: 0.35 + random() * 0.65 }));
  return (
    <Svg width={width} height={horizon} style={at(0, 0)}>
      <Defs>
        <LinearGradient id="sceneSky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={palette.top} />
          <Stop offset="0.3" stopColor={palette.upper} />
          <Stop offset="0.7" stopColor={palette.mid} />
          <Stop offset="1" stopColor={palette.low} />
        </LinearGradient>
      </Defs>
      <Rect width={width} height={horizon} fill="url(#sceneSky)" />
      {palette.stars > 0 ? stars.map((star, i) => <Circle key={i} cx={star.x} cy={star.y} r={star.r} fill="#FFFFFF" opacity={star.o * palette.stars} />) : null}
    </Svg>
  );
}

function Clouds({ width, top, horizon, palette, weather, active, scrollY }: { width: number; top: number; horizon: number; palette: SkyPalette; weather: SceneWeather; active: boolean; scrollY: SharedValue<number> }) {
  const drift = useLoop(active, Math.max(18_000, 70_000 - weather.windKmh * 1400));
  // Clouds are the far layer: they trail the scroll slightly.
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: drift.get() * 36 - 18 }, { translateY: Math.min(40, Math.max(0, scrollY.get()) * 0.15) }],
  }));
  const random = seeded(23);
  const count = weather.cloudPct < 10 ? 0 : Math.ceil(weather.cloudPct / 11);
  const puffs = Array.from({ length: count }, () => {
    const x = random() * width;
    // Keep whole clouds below the ticket, so they don't smudge through its glass.
    const y = top + 42 + random() * Math.max(1, horizon - top - 92);
    const span = 70 + random() * 100;
    // Many soft, flattened puffs along a flat base read as one natural cloud.
    return Array.from({ length: 7 }, (_, i) => {
      const along = i / 6 - 0.5;
      const ry = 8 + (0.5 - Math.abs(along)) * 22 + random() * 5;
      return { cx: x + along * span, cy: y - ry * 0.45, rx: span * (0.22 + random() * 0.1), ry };
    });
  }).flat();
  if (!count) return null;
  return (
    <Animated.View style={[at(0, 0), style]}>
      <Svg width={width} height={horizon}>
        <Defs>
          <RadialGradient id="cloudLight">
            <Stop offset="0" stopColor={palette.cloudLight} stopOpacity={0.5} />
            <Stop offset="1" stopColor={palette.cloudLight} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="cloudShade">
            <Stop offset="0" stopColor={palette.cloudShade} stopOpacity={0.38} />
            <Stop offset="1" stopColor={palette.cloudShade} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        {puffs.map((puff, i) => <Ellipse key={`shade${i}`} {...puff} cy={puff.cy + 6} fill="url(#cloudShade)" />)}
        {puffs.map((puff, i) => <Ellipse key={`light${i}`} {...puff} fill="url(#cloudLight)" />)}
      </Svg>
    </Animated.View>
  );
}

function Orb({ width, horizon, x, y, palette, moon }: { width: number; horizon: number; x: number; y: number; palette: SkyPalette; moon: SceneProps['moon'] }) {
  const { core, edge, glow } = palette.orb;
  const r = ORB / 2;
  const halo = r * (palette.phase === 'sun' ? 2.8 : 1.9);
  const shine = (palette.phase === 'afterglow' ? 0.2 : 1) * (1 - palette.haze * 0.6);
  return (
    <Svg width={width} height={horizon} style={at(0, 0)}>
      <Defs>
        <RadialGradient id="orbGlow">
          <Stop offset="0.25" stopColor={glow} stopOpacity={0.5 * shine} />
          <Stop offset="0.55" stopColor={glow} stopOpacity={0.16 * shine} />
          <Stop offset="1" stopColor={glow} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="orbFace">
          <Stop offset="0" stopColor={core} />
          <Stop offset="0.8" stopColor={mix(core, edge, 0.6)} />
          <Stop offset="1" stopColor={edge} />
        </RadialGradient>
      </Defs>
      <Circle cx={x} cy={y} r={halo} fill="url(#orbGlow)" />
      <Circle cx={x} cy={y} r={r} fill="url(#orbFace)" />
      {palette.night ? <Path d={moonShadowPath(x, y, r, moon.fraction, moon.waxing)} fill="#3A4652" opacity={0.3} /> : null}
    </Svg>
  );
}

/** Rolling ridge with small irregularities; rises toward the edges to frame the sun. */
export function ridgePath(width: number, base: number, rise: number, seed: number) {
  const random = seeded(seed);
  const phase = random() * 6;
  // Uneven sides, so the hills don't form a symmetrical bowl.
  const left = rise * (0.35 + random() * 0.65);
  const right = rise * (0.35 + random() * 0.65);
  let path = `M0 ${base + SHORE}`;
  for (let x = 0; x <= width + 6; x += 6) {
    const side = Math.abs((x / width) * 2 - 1);
    const roll = (Math.sin(x / 37 + phase) + Math.sin(x / 17 + phase * 2) * 0.4 + 1.4) * 3;
    path += ` L${x} ${base - side * side * (x < width / 2 ? left : right) - roll - random() * 1.5}`;
  }
  return `${path} L${width + 6} ${base + SHORE} Z`;
}

/** Spruce and pine silhouettes: low in the middle, taller toward both edges. */
export function treesPath(width: number, base: number, scale = 1) {
  const random = seeded(37);
  let path = '';
  for (let x = -4; x < width + 8; x += (2.5 + random() * 4) * Math.max(0.6, scale)) {
    const side = Math.abs((x / width) * 2 - 1);
    const h = (4 + random() * 8 + side * side * (10 + random() * 20)) * scale;
    const w = 2 * scale + h * 0.2;
    const y = base + 2 - h;
    path += `M${x} ${y} L${x + w * 0.45} ${y + h * 0.36} L${x + w * 0.2} ${y + h * 0.34} L${x + w * 0.8} ${y + h * 0.68} L${x + w * 0.35} ${y + h * 0.65} L${x + w} ${base + 3} L${x - w} ${base + 3} L${x - w * 0.35} ${y + h * 0.65} L${x - w * 0.8} ${y + h * 0.68} L${x - w * 0.2} ${y + h * 0.34} L${x - w * 0.45} ${y + h * 0.36} Z`;
  }
  return path;
}

function Shore({ width, horizon, palette, birds }: { width: number; horizon: number; palette: SkyPalette; birds: boolean }) {
  const height = 180;
  const land = height - SHORE;
  return (
    <Svg width={width} height={height} style={at(0, horizon - height)}>
      <Path d={ridgePath(width, land - 2, 34, 5)} fill={palette.farShore} />
      <Path d={ridgePath(width, land + 3, 18, 9)} fill={palette.midShore} />
      <Path d={treesPath(width, land)} fill={palette.nearShore} />
      <Rect y={land} width={width} height={SHORE} fill={palette.nearShore} />
      {birds ? <Path d={`M${width * 0.16} 48 q4 -4 7 1 q4 -5 8 -2 M${width * 0.22} 63 q3 -3 5 1 q3 -4 6 -1`} stroke={palette.nearShore} strokeWidth={1.2} fill="none" opacity={0.65} /> : null}
    </Svg>
  );
}

function Surface({ width, horizon, palette, windKmh, ice }: { width: number; horizon: number; palette: SkyPalette; windKmh: number; ice: boolean }) {
  const random = seeded(53);
  const chop = Math.min(1, windKmh / 35);
  let light = '';
  let dark = '';
  for (let i = 0; i < (ice ? 16 : 70 + chop * 90); i += 1) {
    // Perspective: ripples are short and dense at the horizon, long and open up close.
    const depth = random() ** 1.7;
    const length = (4 + random() * 10) * (0.5 + depth * 2);
    const lift = chop * depth * 3;
    const ripple = `M${random() * width} ${1 + depth * (SURFACE - 4)} q${length / 2} ${-lift} ${length} 0 `;
    if (i % 2) light += ripple;
    else dark += ripple;
  }
  return (
    <Svg width={width} height={SURFACE} style={at(0, horizon)}>
      <Defs>
        <LinearGradient id="sceneSurface" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={palette.surfaceFar} />
          <Stop offset="1" stopColor={palette.surfaceNear} />
        </LinearGradient>
        <LinearGradient id="shoreReflection" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={palette.nearShore} stopOpacity={ice ? 0.12 : 0.4} />
          <Stop offset="1" stopColor={palette.nearShore} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Rect width={width} height={SURFACE} fill="url(#sceneSurface)" />
      <Rect width={width} height={20} fill="url(#shoreReflection)" />
      <Path d={dark} stroke={palette.nearShore} strokeWidth={1} opacity={0.22} fill="none" />
      <Path d={light} stroke={palette.cloudLight} strokeWidth={1} opacity={0.35} fill="none" />
    </Svg>
  );
}

function Glitter({ width, top, color, active }: { width: number; top: number; color: string; active: boolean }) {
  const shimmer = useLoop(active, 2400);
  const style = useAnimatedStyle(() => ({ opacity: 0.55 + shimmer.get() * 0.4 }));
  const random = seeded(71);
  let path = '';
  for (let i = 0; i < 65; i += 1) {
    const depth = random();
    const spread = 12 + depth * 42;
    const length = 2 + random() * (4 + depth * 12);
    path += `M${width / 2 + (random() + random() - 1) * spread - length / 2} ${1 + depth * (SURFACE - 3)} h${length} `;
  }
  return (
    <Animated.View style={[at(0, top), style]}>
      <Svg width={width} height={SURFACE}>
        <Path d={path} stroke={color} strokeWidth={1.3} strokeLinecap="round" opacity={0.8} />
      </Svg>
    </Animated.View>
  );
}

function Rain({ width, height, heavy, active }: { width: number; height: number; heavy: boolean; active: boolean }) {
  const tile = 160;
  const fall = useLoop(active, 900, { reverse: false });
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: fall.get() * tile - tile }] }));
  const random = seeded(89);
  const drops = Array.from({ length: heavy ? 46 : 22 }, () => ({ x: random() * width, y: random() * tile }));
  let path = '';
  for (let offset = 0; offset < height + tile; offset += tile) {
    for (const drop of drops) path += `M${drop.x} ${drop.y + offset} l-2 12 `;
  }
  return (
    <View style={[at(0, 0), { width, height, overflow: 'hidden' }]}>
      <Animated.View style={style}>
        <Svg width={width} height={height + tile}>
          <Path d={path} stroke="#DCE6EA" strokeWidth={0.8} opacity={0.3} />
        </Svg>
      </Animated.View>
    </View>
  );
}

/* ───────────── Under the water ───────────── */

function Underwater({ width, top, height, palette }: { width: number; top: number; height: number; palette: SkyPalette }) {
  const wave = `M0 3 C${width * 0.18} 0 ${width * 0.3} 6 ${width * 0.5} 3 S${width * 0.82} 1 ${width} 3`;
  return (
    <Svg width={width} height={height} style={at(0, top)}>
      <Defs>
        <LinearGradient id="sceneWater" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={palette.underTop} />
          <Stop offset="1" stopColor={palette.underDeep} />
        </LinearGradient>
      </Defs>
      <Rect width={width} height={height} fill="url(#sceneWater)" />
      <Path d={`${wave} L${width} 0 L0 0 Z`} fill={palette.surfaceNear} />
      <Path d={wave} stroke={palette.cloudLight} strokeWidth={1.2} opacity={0.65} fill="none" />
    </Svg>
  );
}

function LightShafts({ width, top, height, strength, active }: { width: number; top: number; height: number; strength: number; active: boolean }) {
  const shimmer = useLoop(active, 4600);
  const style = useAnimatedStyle(() => ({ opacity: strength * (0.55 + shimmer.get() * 0.45) }));
  const random = seeded(97);
  const shafts = Array.from({ length: 7 }, () => ({ x: random() * width, w: 8 + random() * 28, lean: (random() - 0.5) * 90 }));
  return (
    <Animated.View style={[at(0, top), style]}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="sceneShaft" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#C8EEE4" stopOpacity={0.045} />
            <Stop offset="1" stopColor="#C8EEE4" stopOpacity={0} />
          </LinearGradient>
        </Defs>
        {/* Nested faint layers give each ray a soft edge */}
        {shafts.flatMap(({ x, w, lean }, i) =>
          [1, 0.7, 0.4].map((spread) => {
            const near = w * spread;
            const far = w * 2.4 * spread;
            return <Path key={`${i}:${spread}`} d={`M${x - near / 2} 4 h${near} L${x + lean + far / 2} ${height * 0.8} L${x + lean - far / 2} ${height * 0.8} Z`} fill="url(#sceneShaft)" />;
          }),
        )}
      </Svg>
    </Animated.View>
  );
}

function Particles({ width, top, height, active }: { width: number; top: number; height: number; active: boolean }) {
  const reduced = useReducedMotion();
  const drift = useLoop(active, 14_000);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: drift.get() * 16 }, { translateY: drift.get() * -7 }] }));
  const random = seeded(101);
  let path = '';
  for (let i = 0; i < 40; i += 1) path += `M${random() * width} ${random() * height} h0.1 `;
  if (reduced || !height) return null;
  return (
    <Animated.View style={[at(0, top), style]}>
      <Svg width={width} height={height}>
        <Path d={path} stroke="#CFE3D8" strokeWidth={1.5} strokeLinecap="round" opacity={0.28} />
      </Svg>
    </Animated.View>
  );
}

function Bed({ width, top, palette }: { width: number; top: number; palette: SkyPalette }) {
  const random = seeded(113);
  const rocks = Array.from({ length: 13 }, () => ({ x: random() * width, w: 7 + random() ** 2 * 32, y: 38 + random() * 20 }));
  let grains = '';
  for (let i = 0; i < 150; i += 1) grains += `M${random() * width} ${40 + random() * 22} h${0.3 + random()} `;
  return (
    <Svg width={width} height={74} style={at(0, top)}>
      <Defs>
        <LinearGradient id="sceneSilt" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={palette.sandLight} />
          <Stop offset="0.6" stopColor={palette.sandDark} />
          {/* The bed falls away into the deep water of the tab bar */}
          <Stop offset="1" stopColor={palette.underDeep} />
        </LinearGradient>
        <LinearGradient id="sceneRock" x1="0" y1="0" x2="0.4" y2="1">
          <Stop offset="0" stopColor={mix(palette.sandLight, '#9AA6A0', 0.3)} />
          <Stop offset="1" stopColor={mix(palette.sandDark, '#000000', 0.3)} />
        </LinearGradient>
      </Defs>
      <Path d={`M0 22 C${width * 0.2} 10 ${width * 0.4} 34 ${width * 0.62} 22 S${width * 0.9} 12 ${width} 20 V74 H0 Z`} fill={palette.sandDark} opacity={0.7} />
      <Path d={`M0 38 C${width * 0.16} 26 ${width * 0.34} 44 ${width * 0.52} 36 S${width * 0.84} 24 ${width} 36 V74 H0 Z`} fill="url(#sceneSilt)" />
      <Path d={grains} stroke={palette.sandDark} strokeWidth={1.4} />
      {rocks.map(({ x, w, y }, i) => <Path key={i} d={`M${x - w / 2} ${y} C${x - w * 0.5} ${y - w * 0.35} ${x - w * 0.1} ${y - w * 0.52} ${x + w * 0.2} ${y - w * 0.4} Q${x + w * 0.55} ${y - w * 0.2} ${x + w / 2} ${y} Z`} fill="url(#sceneRock)" />)}
    </Svg>
  );
}

const WEEDS = [0.03, 0.07, 0.1, 0.29, 0.69, 0.91, 0.96];

function Weeds({ width, color, active }: { width: number; color: string; active: boolean }) {
  return <>{WEEDS.map((x, i) => <Weed key={x} x={x * width} height={30 + ((i * 37) % 40)} color={color} period={2800 + ((i * 613) % 1700)} active={active} />)}</>;
}

function Weed({ x, height, color, period, active }: { x: number; height: number; color: string; period: number; active: boolean }) {
  const sway = useLoop(active, period);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${sway.get() * 10 - 5}deg` }] }));
  let leaves = '';
  for (let y = height - 6; y > 4; y -= 6) leaves += `M14 ${y} q-6 -1 -9 -8 q7 1 9 8 M14 ${y - 3} q6 -1 9 -8 q-7 1 -9 8 `;
  return (
    <Animated.View style={[styles.weed, { left: x - 14, width: 28, height }, style]}>
      <Svg width={28} height={height}>
        <Path d={`M14 ${height} Q12 ${height / 2} 14 2`} stroke={color} strokeWidth={1.4} fill="none" />
        <Path d={leaves} fill={color} />
      </Svg>
    </Animated.View>
  );
}

function Bubbles({ width, active }: { width: number; active: boolean }) {
  const reduced = useReducedMotion();
  if (reduced) return null;
  return <>{[0.08, 0.3, 0.72, 0.93].map((x, i) => <Bubble key={x} x={x * width} size={3 + (i % 3)} duration={6500 + i * 1300} delay={i * 1700} active={active} />)}</>;
}

function Bubble({ x, size, duration, delay, active }: { x: number; size: number; duration: number; delay: number; active: boolean }) {
  const rise = useLoop(active, duration, { reverse: false, delay });
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(rise.get() * 5, 1 - rise.get()) * 0.6,
    transform: [{ translateY: rise.get() * -90 }, { translateX: Math.sin(rise.get() * 12) * 3 }],
  }));
  return <Animated.View style={[styles.bubble, { left: x, width: size, height: size, borderRadius: size / 2 }, style]} />;
}

function Bobber({ x, waterline, lineEnd, windKmh, active }: { x: number; waterline: number; lineEnd: number; windKmh: number; active: boolean }) {
  const bob = useLoop(active, Math.max(900, 2200 - windKmh * 35));
  const swing = Math.min(3, 1 + windKmh / 15);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: bob.get() * swing }] }));
  const height = Math.max(40, lineEnd - waterline + 40);
  return (
    <Animated.View style={[at(x - 10, waterline - 20), style]}>
      <Svg width={20} height={height}>
        <Defs>
          <LinearGradient id="bobberTop" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#E0604A" />
            <Stop offset="1" stopColor="#7E2219" />
          </LinearGradient>
          <LinearGradient id="bobberBase" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#F1EEE4" />
            <Stop offset="1" stopColor="#8E918B" />
          </LinearGradient>
        </Defs>
        <Path d={`M10 28 Q8 ${height / 2} 10 ${height - 14}`} stroke="#DCE6E2" strokeWidth={0.6} opacity={0.5} fill="none" />
        <Path d="M10 5 V14" stroke="#31383A" strokeWidth={1.5} />
        <Path d="M4 21 C4 10 16 10 16 21 Z" fill="url(#bobberTop)" />
        <Path d="M4 21 C4 30 16 30 16 21 Z" fill="url(#bobberBase)" />
        <Path d={`M10 ${height - 16} q4 5 0 11 q-4 -6 0 -11`} fill="#B98543" />
        <Path d={`M10 ${height - 5} v2 q0 3 -3 1`} stroke="#AEB7B4" strokeWidth={0.8} fill="none" />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  scene: { position: 'absolute', top: 0, left: 0, overflow: 'hidden' },
  weed: { position: 'absolute', bottom: 32, transformOrigin: 'bottom' },
  bubble: { position: 'absolute', bottom: 48, borderWidth: 0.7, borderColor: 'rgba(220,240,238,0.9)', backgroundColor: 'rgba(220,240,238,0.15)' },
});
