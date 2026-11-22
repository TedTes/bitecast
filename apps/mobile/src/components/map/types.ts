/**
 * Provider-agnostic map contract. Any map implementation (code-native cached chart,
 * MapLibre, react-native-maps) receives the same props, so screens never import a
 * map SDK directly.
 */
export type MapLakePin = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  /** Peak bite score for the selected period, or null when there is no published forecast. */
  score: number | null;
  followed: boolean;
  /** Relative water-body size hint for the offline chart. */
  scale: 'large' | 'small';
};

/** Screen-reader description of a pin. */
export const pinScoreLabel = (score: number | null, band: string | undefined) => (score === null ? 'no forecast yet' : `best bite score ${score}, ${band}`);

export type LakeMapProps = {
  pins: MapLakePin[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

export type MapMode = 'cached' | 'tiles';
