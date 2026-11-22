import type { Season } from '@bitecast/engine';
import type { CatchLog } from '@/types/app';

/*
 * Several methods per trip, ahead of the data model supporting them. The extra fields travel in
 * the log’s local SQLite JSON; sync, export and training only see `method` until they are added to
 * CatchLog. That scalar must therefore never claim a method caught a fish when we don’t know it.
 */

export type Method = CatchLog['method'];
export type LogWithMethods = CatchLog & { methods?: Method[]; caughtOnMethod?: Method };

export const methodLabels: Record<Method, string> = { jig: 'Jig', troll: 'Troll', cast: 'Cast', 'tip-up': 'Tip-up' };

const bySeason: Record<Season, Method[]> = {
  open_water: ['jig', 'troll', 'cast'],
  ice: ['jig', 'tip-up'],
};
const usual: Record<Season, Method> = { open_water: 'jig', ice: 'tip-up' };

/** The methods a log records, including logs saved with a single method. */
export function methodsOf(log: LogWithMethods): Method[] {
  if (log.methods?.length) return log.methods;
  return log.method in methodLabels ? [log.method] : [];
}

/** The methods to offer: the season’s, plus any the log being edited already has. */
export const methodOptions = (season: Season, recorded: Method[] = []): Method[] => Array.from(new Set([...bySeason[season], ...recorded]));

/** A new trip’s selection: carried over where it suits the season, otherwise the season’s usual one. */
export function methodsForSeason(season: Season, carried: Method[] = []): Method[] {
  const suited = carried.filter((method) => bySeason[season].includes(method));
  return suited.length ? suited : [usual[season]];
}

/** The fields to save for a selection. */
export function methodFields(selected: Method[], caughtOn: Method | undefined, caught: boolean): Pick<LogWithMethods, 'method' | 'methods' | 'caughtOnMethod'> {
  // Stored in one order, however they were tapped.
  const methods = (Object.keys(methodLabels) as Method[]).filter((method) => selected.includes(method));
  const only = methods.length === 1 ? methods[0] : undefined;
  const caughtOnMethod = caught && methods.length > 1 && caughtOn && methods.includes(caughtOn) ? caughtOn : undefined;
  return {
    methods,
    caughtOnMethod,
    // ‘other’ is the backend contract’s value for an unknown method. The app type doesn’t list it yet.
    method: only ?? caughtOnMethod ?? ('other' as Method),
  };
}

export const methodsText = (log: LogWithMethods) => methodsOf(log).map((method) => methodLabels[method]).join(', ') || 'Method not noted';
