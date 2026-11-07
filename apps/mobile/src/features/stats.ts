import type { CatchLog } from '@/types/app';

/** Pure, local-only pattern calculations over catch logs (synced or not). */
export type Bucket = { key: string; label: string; trips: number; successes: number; fish: number; rate: number };

const bucket = (key: string, label: string, logs: CatchLog[]): Bucket => {
  const successes = logs.filter((log) => log.caught).length;
  return { key, label, trips: logs.length, successes, fish: logs.reduce((sum, log) => sum + (log.caught ? log.count : 0), 0), rate: logs.length ? successes / logs.length : 0 };
};

const periods = [
  { key: 'dawn', label: 'Dawn', hint: '4–8 am', test: (h: number) => h >= 4 && h < 8 },
  { key: 'morning', label: 'Morning', hint: '8 am–noon', test: (h: number) => h >= 8 && h < 12 },
  { key: 'afternoon', label: 'Afternoon', hint: 'noon–5 pm', test: (h: number) => h >= 12 && h < 17 },
  { key: 'dusk', label: 'Dusk', hint: '5–9 pm', test: (h: number) => h >= 17 && h < 21 },
  { key: 'night', label: 'Night', hint: '9 pm–4 am', test: (h: number) => h >= 21 || h < 4 },
];

export function byTimeOfDay(logs: CatchLog[]) {
  return periods.map((period) => ({ ...bucket(period.key, period.label, logs.filter((log) => period.test(new Date(log.caughtAt).getHours()))), hint: period.hint }));
}

export function byLight(logs: CatchLog[]) {
  return (['Low light', 'Mid light', 'Bright'] as const).map((light) => bucket(light, light, logs.filter((log) => log.lightCondition === light)));
}

export function byBait(logs: CatchLog[], limit = 4) {
  const groups = new Map<string, CatchLog[]>();
  logs.forEach((log) => {
    const name = log.bait.trim() || 'Not noted';
    const key = name.toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), log]);
  });
  return [...groups.entries()]
    .map(([key, items]) => bucket(key, items[0].bait.trim() || 'Not noted', items))
    .sort((a, b) => b.fish - a.fish || b.rate - a.rate || b.trips - a.trips)
    .slice(0, limit);
}

export function summary(logs: CatchLog[]) {
  const all = bucket('all', 'All', logs);
  const best = <T extends Bucket>(items: T[]) => items.filter((item) => item.trips >= 2).sort((a, b) => b.rate - a.rate || b.fish - a.fish)[0];
  return { ...all, bestPeriod: best(byTimeOfDay(logs)), bestLight: best(byLight(logs)) };
}
