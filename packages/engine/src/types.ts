export type Clarity = 'clear' | 'stained' | 'murky';
export type Season = 'open_water' | 'ice';
export type Confidence = 'High' | 'Medium' | 'Low';
export type PredictionGranularity = 'hour' | 'time_block';
export type TimePrecision = 'exact' | 'time_block' | 'day' | 'unknown';

export type SpeciesProfile = {
  id: 'walleye';
  idealLightBand: Record<Clarity, [number, number]>;
  transitionWeight: number;
  pressureWeight: number;
  moonWeight: number;
  tactics: Array<{
    season: Season;
    light: 'low' | 'mid' | 'high';
    depth: 'shallow' | 'mid' | 'deep';
    text: string;
  }>;
  version: string;
};

export type LakeProfile = {
  id: string;
  name: string;
  region: string;
  provinceState: string;
  latitude: number;
  longitude: number;
  clarity: Clarity | null;
};

export type WeatherHour = {
  ts: string;
  sunElevation: number;
  cloudPct: number;
  windKmh: number;
  precipitationMm: number;
  pressureHpa: number;
  moonIllumination: number;
  fetchedAt: string;
};

export type ForecastHour = WeatherHour & {
  score: number;
  light: number;
  transition: number;
  reasons: string[];
  confidence: Confidence;
  predictionGranularity?: PredictionGranularity;
  timePrecision?: TimePrecision;
};

export type ForecastWindow = {
  id: string;
  start: string;
  end: string;
  peakScore: number;
  reasons: string[];
  confidence: Confidence;
  depth: 'shallow' | 'mid' | 'deep';
  tactics: string;
  hours: ForecastHour[];
  predictionGranularity?: PredictionGranularity;
  timePrecision?: TimePrecision;
};

export type LakeForecast = {
  lakeId: string;
  engineVersion: string;
  computedAt: string;
  modelFamily?: 'hourly' | 'trip_broad';
  predictionGranularity?: PredictionGranularity;
  hours: ForecastHour[];
  windows: ForecastWindow[];
};
