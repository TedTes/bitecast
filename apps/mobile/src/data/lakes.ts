import type { Lake } from '@/types/app';

const official = 'https://www.ontario.ca/document/ontario-fishing-regulations-summary';
const regulation = (limits: string): Lake['regulation'] => ({
  seasonOpen: 'Check Zone summary', seasonClose: 'Check Zone summary', limits, sourceUrl: official, lastVerified: '2026-11-06',
});
export const lakes: Lake[] = [
  { id: 'lake-erie', name: 'Lake Erie', region: 'Great Lakes', provinceState: 'ON', latitude: 42.2, longitude: -81.2, clarity: 'stained', regulation: regulation('Walleye limits vary by Fisheries Management Zone and licence type.') },
  { id: 'lake-ontario', name: 'Lake Ontario', region: 'Great Lakes', provinceState: 'ON', latitude: 43.6, longitude: -77.9, clarity: 'clear', regulation: regulation('Review current Zone 20 walleye season and limits before fishing.') },
  { id: 'bay-of-quinte', name: 'Bay of Quinte', region: 'Eastern Ontario', provinceState: 'ON', latitude: 44.16, longitude: -77.18, clarity: 'stained', regulation: regulation('Review Zone 20 exceptions and current walleye limits.') },
  { id: 'lake-simcoe', name: 'Lake Simcoe', region: 'Central Ontario', provinceState: 'ON', latitude: 44.43, longitude: -79.37, clarity: 'clear', regulation: regulation('Review the Lake Simcoe exceptions and current season dates.') },
  { id: 'rainy-lake', name: 'Rainy Lake', region: 'Northwestern Ontario', provinceState: 'ON', latitude: 48.62, longitude: -93.16, clarity: 'stained', regulation: regulation('Review Zone 5 and border-water rules before fishing.') },
  { id: 'lake-nipissing', name: 'Lake Nipissing', region: 'Northeastern Ontario', provinceState: 'ON', latitude: 46.25, longitude: -79.78, clarity: 'stained', regulation: regulation('Special walleye rules apply. Consult the current Zone 11 summary.') },
  { id: 'lake-of-the-woods', name: 'Lake of the Woods', region: 'Northwestern Ontario', provinceState: 'ON', latitude: 49.1, longitude: -94.1, clarity: 'stained', regulation: regulation('Review Zone 5 exceptions and border-water rules.') },
  { id: 'french-river', name: 'French River', region: 'Northeastern Ontario', provinceState: 'ON', latitude: 46.03, longitude: -80.52, clarity: 'murky', regulation: regulation('Review current Zone 10 and Zone 11 boundaries and exceptions.') },
];
export const lakeById = (id: string) => lakes.find((lake) => lake.id === id) ?? lakes[0];
