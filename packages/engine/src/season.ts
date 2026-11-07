import type { Season } from './types';

/**
 * Typical ice-fishing period by latitude for Ontario and the Great Lakes, as day-of-year
 * windows. This describes when a lake *usually* has ice-fishing conditions so the app can
 * pick a sensible default mode. It is never an assessment of ice safety.
 */
const bands: Array<{ minLatitude: number; start: [number, number]; end: [number, number] }> = [
  { minLatitude: 48, start: [12, 1], end: [4, 20] }, // Northwestern Ontario
  { minLatitude: 45, start: [12, 15], end: [4, 5] }, // Near north
  { minLatitude: 43.5, start: [1, 5], end: [3, 20] }, // Central / Lake Ontario shore
  { minLatitude: -90, start: [1, 15], end: [2, 28] }, // Southern Great Lakes
];

const ordinal = (month: number, day: number) => month * 100 + day;

export function typicalSeason(latitude: number, date: Date = new Date()): Season {
  const band = bands.find((item) => latitude >= item.minLatitude) ?? bands[bands.length - 1];
  const today = ordinal(date.getMonth() + 1, date.getDate());
  const start = ordinal(...band.start);
  const end = ordinal(...band.end);
  // Windows that wrap the new year (e.g. Dec → Apr) vs. ones inside one calendar year.
  const inside = start > end ? today >= start || today <= end : today >= start && today <= end;
  return inside ? 'ice' : 'open_water';
}
