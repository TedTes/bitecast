import { lakeById } from '@/data/lakes';
import type { CatchLog } from '@/types/app';

const cell = (value: unknown) => {
  const text = value === undefined || value === null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** CSV export of local catch logs. Metric units, ISO timestamps. */
export function catchLogsToCsv(logs: CatchLog[]) {
  const header = ['logged_at', 'lake', 'caught', 'count', 'length_cm', 'depth_m', 'bait', 'method', 'clarity', 'bite_score', 'light', 'conditions', 'notes', 'sync_state'];
  const rows = logs.map((log) => [log.caughtAt, lakeById(log.lakeId).name, log.caught ? 'yes' : 'no', log.count, log.lengthCm, log.depthM, log.bait, log.method, log.clarity, log.scoreAtTime, log.lightCondition, log.conditions.summary, log.notes, log.syncState]);
  return [header, ...rows].map((row) => row.map(cell).join(',')).join('\n');
}
