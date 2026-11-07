import { typicalSeason, type Season } from '@bitecast/engine';
import { lakeById } from '@/data/lakes';
import { useAppStore } from '@/store/use-app-store';
import type { AppSettings, LakeSeasons } from '@/types/app';

export type LakeCondition = {
  season: Season;
  /** manual: set by the angler · typical: from latitude + date · open-only: angler doesn't ice fish. */
  source: 'manual' | 'typical' | 'open-only';
};

/** Pure resolver: manual choice → typical for the lake (if the angler ice fishes) → open water. */
export function resolveLakeCondition(lakeId: string, settings: Pick<AppSettings, 'iceFishing'>, overrides: LakeSeasons, date = new Date()): LakeCondition {
  const manual = overrides[lakeId];
  if (manual) return { season: manual, source: 'manual' };
  if (!settings.iceFishing) return { season: 'open_water', source: 'open-only' };
  return { season: typicalSeason(lakeById(lakeId).latitude, date), source: 'typical' };
}

/** Resolver bound to current settings, for lists of lakes. */
export function useConditionResolver() {
  const iceFishing = useAppStore((state) => state.settings.iceFishing);
  const overrides = useAppStore((state) => state.lakeSeasons);
  return (lakeId: string) => resolveLakeCondition(lakeId, { iceFishing }, overrides);
}

export function useLakeCondition(lakeId: string) {
  return useConditionResolver()(lakeId);
}

export const seasonLabel = (season: Season) => (season === 'ice' ? 'Ice' : 'Open water');
export const sourceLabel = (condition: LakeCondition, date = new Date()) =>
  condition.source === 'manual' ? 'Set by you' : condition.source === 'typical' ? `Typical for ${date.toLocaleDateString([], { month: 'long' })} at this latitude` : 'You fish open water only';
