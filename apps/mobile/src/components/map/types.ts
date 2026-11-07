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
  /** Peak bite score for the selected period; pins always pair it with the band word. */
  score: number;
  followed: boolean;
  /** Relative water-body size hint for the offline chart. */
  scale: 'large' | 'small';
};

export type LakeMapProps = {
  pins: MapLakePin[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

export type MapMode = 'cached' | 'tiles';
