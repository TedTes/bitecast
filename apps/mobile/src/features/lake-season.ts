import { useAppStore } from '@/store/use-app-store';
import { resolveLakeCondition } from './lake-condition';

export { resolveLakeCondition, seasonLabel, sourceLabel, type LakeCondition } from './lake-condition';

/** Resolver bound to current settings, for lists of lakes. */
export function useConditionResolver() {
  const iceFishing = useAppStore((state) => state.settings.iceFishing);
  const overrides = useAppStore((state) => state.lakeSeasons);
  return (lakeId: string) => resolveLakeCondition(lakeId, { iceFishing }, overrides);
}

export function useLakeCondition(lakeId: string) {
  return useConditionResolver()(lakeId);
}
