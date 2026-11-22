import type { LogWithMethods } from './trip-methods';

/*
 * Several baits per trip, the same way as trip-methods.ts. `bait` is still the only text that
 * sync, export and Patterns read, so it names the bait the fish came on when that is known and
 * otherwise lists them all. `baitCategory` is a training input, so it never guesses.
 */

export type TripLog = LogWithMethods & { baits?: string[]; caughtOnBait?: string };

/** validateCatchLog rejects longer text from sync. */
const BAIT_TEXT_MAX = 100;

const uniqueBaits = (names: string[]) => {
  const seen = new Map<string, string>();
  for (const name of names.map((item) => item.trim()).filter(Boolean)) if (!seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), name);
  return [...seen.values()];
};

/** The baits a log records, including logs saved with a single one. */
export const baitsOf = (log: TripLog) => uniqueBaits(log.baits?.length ? log.baits : [log.bait]);

export const baitsText = (log: TripLog) => baitsOf(log).join(', ') || 'No bait noted';

/** Chips to offer: the season’s recent baits, then its presets, and always what is already picked. */
export function baitOptions(logs: TripLog[], season: TripLog['seasonMode'], presets: string[], keep: string[] = []) {
  const recent = uniqueBaits(logs.filter((log) => log.seasonMode === season).flatMap(baitsOf)).slice(0, 4);
  return uniqueBaits([...uniqueBaits([...recent, ...presets]).slice(0, 6), ...keep]);
}

/** A new trip starts with the last trip’s baits from the same season, otherwise the usual one. */
export function baitsForSeason(logs: TripLog[], season: TripLog['seasonMode'], presets: string[]) {
  const last = logs.find((log) => log.seasonMode === season);
  const carried = last ? baitsOf(last) : [];
  return carried.length ? carried : [presets[0]];
}

/** The fields to save for a selection. */
export function baitFields(selected: string[], caughtOn: string | undefined, caught: boolean): Pick<TripLog, 'bait' | 'baitCategory' | 'baits' | 'caughtOnBait'> {
  const baits = uniqueBaits(selected);
  const winner = baits.find((name) => name.toLowerCase() === caughtOn?.trim().toLowerCase());
  const caughtOnBait = caught && baits.length > 1 ? winner : undefined;
  const credited = baits.length === 1 ? baits[0] : caughtOnBait;
  const all = baits.join(', ');
  return {
    baits,
    caughtOnBait,
    bait: credited ?? (all.length <= BAIT_TEXT_MAX ? all : `${baits.length} different baits`),
    baitCategory: credited?.toLowerCase() ?? 'unknown',
  };
}
