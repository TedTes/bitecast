import { Platform, type TextStyle } from 'react-native';

/**
 * BiteCast design tokens.
 *
 * Palette: deep lake ink, mineral teal, fog and cream surfaces, with a restrained
 * sunrise accent reserved for low-light/“window” moments. Text colours meet WCAG AA
 * (4.5:1) on `cream` and `paper`; `onDark*` colours meet AA on `deep`.
 */
export const colors = {
  // Ink (text + dark surfaces)
  ink: '#0B2530',
  inkSoft: '#2F4A54',
  inkMuted: '#4D646C',
  inkFaint: '#7C8F94',
  deep: '#071C25',
  deepRaised: '#0F2C37',
  deepLine: '#21414C',

  // Mineral teal (primary accent)
  teal: '#0F6E78',
  tealDeep: '#0A535B',
  tealTint: '#DCEBE7',
  tealMist: '#EDF4F1',
  mint: '#A9D8C8',

  // Fog + cream surfaces
  cream: '#F4F1E8',
  paper: '#FBFAF5',
  fog: '#E7EAE4',
  fogDeep: '#D6DCD6',
  line: '#DCDFD6',
  lineStrong: '#BFC8C2',
  white: '#FFFFFF',

  // Sunrise (sparingly: windows, low light, highlights)
  sunrise: '#D9783F',
  sunriseInk: '#8A4115',
  sunriseTint: '#F7E6D5',

  // Feedback
  success: '#1F7A5C',
  successTint: '#DDEDE4',
  warning: '#7A5310',
  warningTint: '#F6EBD3',
  warningLine: '#E4CF9F',
  danger: '#A13D34',
  dangerTint: '#F7E3DF',
  dangerLine: '#E9C2BC',

  // On dark surfaces
  onDark: '#F4F1E8',
  onDarkMuted: '#A3B9BC',
  onDarkFaint: '#6F8A90',

  // Chart (map fallback)
  chartWater: '#D3E3E2',
  chartWaterDeep: '#BCD5D6',
  chartLand: '#EAE6D8',
  chartContour: '#A9C6C7',
  chartGrid: '#C9D8D6',
} as const;

/** Bite score bands. Always pair colour with the band label (never colour only). */
export type ScoreBand = 'strong' | 'good' | 'fair' | 'slow';
export const scoreBands: Record<ScoreBand, { label: string; min: number; color: string; onDark: string; tint: string }> = {
  strong: { label: 'Strong', min: 75, color: '#1F7A5C', onDark: '#7FD3B0', tint: '#DDEDE4' },
  good: { label: 'Good', min: 60, color: '#4F7F2E', onDark: '#B9D98A', tint: '#E7EEDB' },
  fair: { label: 'Fair', min: 40, color: '#9A6A12', onDark: '#E9C46A', tint: '#F4EBD5' },
  slow: { label: 'Slow', min: 0, color: '#A34E3A', onDark: '#EE9B85', tint: '#F5E3DC' },
};
export const scoreBand = (score: number): ScoreBand =>
  score >= scoreBands.strong.min ? 'strong' : score >= scoreBands.good.min ? 'good' : score >= scoreBands.fair.min ? 'fair' : 'slow';

export const spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, xxxl: 40 } as const;
export const radius = { xs: 6, sm: 10, md: 14, lg: 20, xl: 28, pill: 999 } as const;

/** Minimum touch target (Apple HIG 44pt, Material 48dp → we use 48 where space allows). */
export const touch = { min: 44, comfortable: 48, large: 56 } as const;
export const hitSlop = { top: 8, bottom: 8, left: 8, right: 8 } as const;

export const elevation = {
  none: {},
  low: Platform.select({
    ios: { shadowColor: '#082630', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
    android: { elevation: 1 },
    default: { boxShadow: '0 2px 8px rgba(8,38,48,.06)' },
  }),
  raised: Platform.select({
    ios: { shadowColor: '#082630', shadowOpacity: 0.1, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
    android: { elevation: 4 },
    default: { boxShadow: '0 6px 18px rgba(8,38,48,.10)' },
  }),
} as const;

const serif = Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia, "Iowan Old Style", serif' });

/**
 * Type scale. Display/title use a serif for the “field journal” voice; everything
 * operational uses the system sans for legibility outdoors. `maxScale` caps Dynamic
 * Type growth only where layout would otherwise break (large numerals, display).
 */
export const type = {
  display: { fontFamily: serif, fontSize: 32, lineHeight: 38, fontWeight: '700', letterSpacing: -0.4, maxScale: 1.35 },
  title: { fontFamily: serif, fontSize: 25, lineHeight: 31, fontWeight: '700', letterSpacing: -0.2, maxScale: 1.4 },
  headline: { fontSize: 19, lineHeight: 25, fontWeight: '700', letterSpacing: -0.2, maxScale: 1.6 },
  subhead: { fontSize: 16, lineHeight: 22, fontWeight: '700', maxScale: 1.8 },
  body: { fontSize: 16, lineHeight: 23, fontWeight: '400', maxScale: 2 },
  callout: { fontSize: 14, lineHeight: 20, fontWeight: '400', maxScale: 2 },
  caption: { fontSize: 12.5, lineHeight: 17, fontWeight: '500', maxScale: 1.8 },
  label: { fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase', maxScale: 1.5 },
  numeralXL: { fontSize: 56, lineHeight: 60, fontWeight: '700', letterSpacing: -1.5, fontVariant: ['tabular-nums'], maxScale: 1.2 },
  numeralL: { fontSize: 34, lineHeight: 38, fontWeight: '700', letterSpacing: -0.8, fontVariant: ['tabular-nums'], maxScale: 1.25 },
  numeralM: { fontSize: 22, lineHeight: 26, fontWeight: '700', letterSpacing: -0.3, fontVariant: ['tabular-nums'], maxScale: 1.3 },
  numeralS: { fontSize: 15, lineHeight: 18, fontWeight: '700', fontVariant: ['tabular-nums'], maxScale: 1.4 },
} satisfies Record<string, TextStyle & { maxScale: number }>;
export type TypeVariant = keyof typeof type;

export const motion = {
  quick: 160,
  base: 240,
  slow: 420,
} as const;
