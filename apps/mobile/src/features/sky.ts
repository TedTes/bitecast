/*
 * Pure sky and lighting maths for the Today scene: colours follow the sun’s altitude
 * (degrees, as SunCalc v2 returns) and cloud cover. Decorative only, never a forecast input.
 */

/** Text and surfaces that sit on the scene. Contrast is covered by sky.test.ts. */
export const onScene = {
  text: '#FFFFFF',
  soft: '#E3EBEA',
  accent: '#FFCB9E',
  glass: 'rgba(7,24,32,0.72)',
  deepGlass: 'rgba(8,30,38,0.86)',
  glassLine: 'rgba(255,255,255,0.22)',
  woodLight: '#694630',
  woodDark: '#4B301F',
} as const;

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

/** Linear mix of two #RRGGBB colours. */
export function mix(a: string, b: string, t: number) {
  const channel = (from: number) => {
    const start = parseInt(a.slice(from, from + 2), 16);
    const end = parseInt(b.slice(from, from + 2), 16);
    return Math.round(start + (end - start) * clamp(t)).toString(16).padStart(2, '0');
  };
  return `#${channel(1)}${channel(3)}${channel(5)}`.toUpperCase();
}

/** Clear-sky colours from zenith to horizon, keyed by sun altitude. */
const CLEAR = [
  { at: -16, top: '#050B16', upper: '#091322', mid: '#12213A', low: '#22324A' },
  { at: -7, top: '#0F1B35', upper: '#1A2848', mid: '#394668', low: '#8A6670' },
  { at: -1, top: '#1B2B4B', upper: '#2C3A5E', mid: '#8A6B86', low: '#F09A62' },
  { at: 5, top: '#24476B', upper: '#34587C', mid: '#8B98A8', low: '#F3C48C' },
  { at: 16, top: '#1F578A', upper: '#2C6697', mid: '#74A5C6', low: '#CFE0E4' },
] as const;

function clearSky(altitude: number) {
  const next = CLEAR.findIndex((key) => key.at >= altitude);
  if (next === 0) return CLEAR[0];
  if (next < 0) return CLEAR[CLEAR.length - 1];
  const a = CLEAR[next - 1];
  const b = CLEAR[next];
  const t = (altitude - a.at) / (b.at - a.at);
  return { top: mix(a.top, b.top, t), upper: mix(a.upper, b.upper, t), mid: mix(a.mid, b.mid, t), low: mix(a.low, b.low, t) };
}

/** Apparent (refraction-corrected) altitude of the sun’s centre at sunrise and sunset. */
const SUN_SET = -0.3;
/** Below this the afterglow has gone and the scene shows the moon. */
const NIGHT = -4;

export type SkyPhase = 'sun' | 'afterglow' | 'moon';
export const skyPhase = (altitude: number): SkyPhase => (altitude < NIGHT ? 'moon' : altitude < SUN_SET ? 'afterglow' : 'sun');

export function skyPalette(altitude: number, cloudPct: number, ice = false) {
  const day = clamp((altitude + 10) / 18);
  const grey = clamp((cloudPct - 35) / 65) * 0.88;
  const clear = clearSky(altitude);
  const top = mix(clear.top, mix('#10161D', '#46545E', day), grey);
  const upper = mix(clear.upper, mix('#161E27', '#53626C', day), grey);
  const mid = mix(clear.mid, mix('#222C36', '#83919B', day), grey);
  const low = mix(clear.low, mix('#2D3841', '#B3BCC0', day), grey);
  const near = mix('#060C10', '#1D3029', day);
  const phase = skyPhase(altitude);
  const night = phase === 'moon';
  const high = clamp(altitude / 25);
  const veil = grey * 0.8;

  return {
    phase,
    night,
    top,
    upper,
    mid,
    low,
    farShore: mix(low, mix('#14202B', '#405C68', day), 0.62),
    midShore: mix(low, mix('#0B141B', '#2C4640', day), 0.84),
    nearShore: near,
    cloudLight: mix(low, '#FFFFFF', 0.1 + day * 0.35),
    cloudShade: mix(mid, mix('#0B1118', '#4A5560', day), 0.45),
    // Water mirrors the sky; mixing warm dawn light with teal here turns it muddy.
    surfaceFar: ice ? mix(low, '#DCE8EC', day * 0.7) : mix(low, mid, 0.35),
    surfaceNear: ice ? mix(mid, '#B9CCD3', day * 0.7) : mix(mid, '#15495A', 0.6),
    underTop: mix('#0A222B', '#1C5C66', day),
    underDeep: mix('#03111A', '#0B2F38', day),
    sandLight: mix('#1C2422', '#776F57', day),
    sandDark: mix('#0E1413', '#433F31', day),
    weed: mix('#0C1D18', '#2F5D45', day),
    orb: night
      ? { core: '#EEF0E8', edge: '#C9CEC8', glow: '#AEBFD2', ink: '#14202A' }
      : phase === 'afterglow'
      ? // The sun is down: a dim dusky disc still carries the score, without posing as the sun.
        { core: mix(mid, '#14182A', 0.7), edge: mix(low, '#14182A', 0.74), glow: low, ink: onScene.text }
      : {
          core: mix(mix('#FFE3A6', '#FFFBEA', high), '#E1E3DE', veil),
          edge: mix(mix('#F0A057', '#F8DE98', high), '#C5CBC9', veil),
          glow: mix(mix('#FF9C50', '#FFF0C0', high), '#C5CBC9', veil),
          ink: '#2B170D',
        },
    stars: clamp((-altitude - 5) / 9) * (1 - clamp(cloudPct / 90)),
    daylight: day,
    haze: grey,
  };
}

export type SkyPalette = ReturnType<typeof skyPalette>;

/** 0 = resting on the horizon … 1 = as high as the scene allows. */
export const orbElevation = (altitude: number) => Math.sqrt(clamp(altitude / 40));

/** SVG path for the unlit part of the moon. Waxing moons are lit from the right. */
export function moonShadowPath(cx: number, cy: number, r: number, fraction: number, waxing: boolean) {
  const rx = r * Math.abs(1 - 2 * fraction);
  const outer = waxing ? 0 : 1;
  const inner = fraction < 0.5 ? outer : 1 - outer;
  return `M${cx} ${cy - r} A${r} ${r} 0 0 ${outer} ${cx} ${cy + r} A${rx} ${r} 0 0 ${inner} ${cx} ${cy - r} Z`;
}

/** Repeatable random numbers, so scenery doesn’t reshuffle on every render. */
export function seeded(seed: number) {
  // Spread small seeds out first, otherwise their first values all land near zero.
  let state = (seed * 69621 * 48271) % 2147483647 || 1;
  if (state < 0) state += 2147483646;
  return () => {
    state = (state * 48271) % 2147483647;
    return state / 2147483647;
  };
}
