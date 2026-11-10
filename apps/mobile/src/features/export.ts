import { lakeById } from '@/data/lakes';
import type { CatchLog } from '@/types/app';

const cell = (value: unknown) => {
  const text = value === undefined || value === null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** CSV export of local catch logs. Metric units, ISO timestamps. */
export function catchLogsToCsv(logs: CatchLog[]) {
  const header = ['trip_started_at', 'trip_ended_at', 'effort_minutes', 'caught_at', 'lake', 'caught', 'count', 'length_cm', 'fishing_depth_m', 'water_depth_m', 'bait', 'method', 'clarity', 'bite_score', 'light', 'conditions', 'training_consent', 'model_version', 'notes', 'sync_state'];
  const rows = logs.map((log) => [log.tripStartedAt, log.tripEndedAt, log.effortMinutes, log.caughtAt, lakeById(log.lakeId).name, log.caught ? 'yes' : 'no', log.count, log.lengthCm, log.depthM, log.waterDepthM, log.bait, log.method, log.clarity, log.scoreAtTime, log.lightCondition, log.conditions.summary, log.trainingConsent ? 'yes' : 'no', log.modelVersionShown, log.notes, log.syncState]);
  return [header, ...rows].map((row) => row.map(cell).join(',')).join('\n');
}
