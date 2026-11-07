import type { AppSettings } from '@/types/app';
import type { IconName } from '@/components/icon';

type Units = AppSettings['units'];

export const formatTime = (value: string | Date) => new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
export const formatHour = (value: string | Date) => new Date(value).toLocaleTimeString([], { hour: 'numeric' }).replace(':00', '').replace(' ', '').toLowerCase();
export const formatRange = (start: string, end: string) => `${formatTime(start)} – ${formatTime(end)}`;
export const formatDay = (value: string | Date, now = new Date()) => {
  const date = new Date(value);
  const days = Math.round((startOfDay(date).getTime() - startOfDay(now).getTime()) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
};
export const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
export const durationLabel = (start: string, end: string) => {
  const minutes = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h && m ? `${h} h ${m} min` : h ? `${h} h` : `${m} min`;
};

/* Units — values are always stored metric. */
export const lengthUnit = (units: Units) => (units === 'metric' ? 'cm' : 'in');
export const depthUnit = (units: Units) => (units === 'metric' ? 'm' : 'ft');
export const toDisplayLength = (cm: number, units: Units) => (units === 'metric' ? cm : round1(cm / 2.54));
export const fromDisplayLength = (value: number, units: Units) => (units === 'metric' ? value : round1(value * 2.54));
export const toDisplayDepth = (m: number, units: Units) => (units === 'metric' ? m : round1(m * 3.28084));
export const fromDisplayDepth = (value: number, units: Units) => (units === 'metric' ? value : round1(value / 3.28084));
export const formatWind = (kmh: number, units: Units) => (units === 'metric' ? `${Math.round(kmh)} km/h` : `${Math.round(kmh / 1.609)} mph`);
export const formatTemp = (c: number, units: Units) => (units === 'metric' ? `${Math.round(c)}°C` : `${Math.round(c * 1.8 + 32)}°F`);
const round1 = (value: number) => Math.round(value * 10) / 10;

/** Maps engine reason strings to an icon. Unknown reasons fall back to “info”. */
export function reasonIcon(reason: string): IconName {
  const r = reason.toLowerCase();
  if (r.includes('transition')) return 'transition';
  if (r.includes('low light') || r.includes('twilight') || r.includes('sunset')) return 'low-light';
  if (r.includes('overcast') || r.includes('cloud')) return 'cloud';
  if (r.includes('rain')) return 'rain';
  if (r.includes('wind') || r.includes('chop')) return 'wind';
  if (r.includes('pressure')) return 'pressure';
  if (r.includes('bright')) return 'sun';
  if (r.includes('calm')) return 'calm';
  if (r.includes('moon')) return 'moon';
  return 'info';
}

/** Reasons that work against the bite get a cautionary tone. */
export const reasonIsNegative = (reason: string) => /bright|slow|high/i.test(reason);

export const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

/** Compact clock label for field use: “7 am”, “7:30 am”, “noon”. */
export function shortClock(value: string | Date) {
  const date = new Date(value);
  const h = date.getHours();
  const m = date.getMinutes();
  if (h === 12 && m === 0) return 'noon';
  if (h === 0 && m === 0) return 'midnight';
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'am' : 'pm'}`;
}

/** Compact range: “7–10 am”, “11 am–2 pm”, “6:30–8 pm”. */
export function shortRange(start: string | Date, end: string | Date) {
  const a = shortClock(start);
  const b = shortClock(end);
  const suffix = (label: string) => label.split(' ')[1];
  if (suffix(a) && suffix(a) === suffix(b)) return `${a.split(' ')[0]}–${b}`;
  return `${a}–${b}`;
}

/** “3 h 12 min”, “45 min”, “2 h”. */
export function formatDuration(ms: number) {
  const total = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}
