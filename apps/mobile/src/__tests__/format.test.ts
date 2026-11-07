import { describe, expect, it } from 'vitest';
import { formatDuration, fromDisplayDepth, fromDisplayLength, reasonIcon, reasonIsNegative, shortClock, shortLakeName, shortRange, toDisplayDepth, toDisplayLength } from '@/lib/format';

const at = (h: number, m = 0) => new Date(2026, 10, 7, h, m);

describe('compact time format', () => {
  it('formats clock times for the field', () => {
    expect(shortClock(at(7))).toBe('7 am');
    expect(shortClock(at(7, 30))).toBe('7:30 am');
    expect(shortClock(at(12))).toBe('noon');
    expect(shortClock(at(0))).toBe('midnight');
    expect(shortClock(at(18))).toBe('6 pm');
  });

  it('shares the suffix when both ends match', () => {
    expect(shortRange(at(7), at(10))).toBe('7–10 am');
    expect(shortRange(at(11), at(14))).toBe('11 am–2 pm');
    expect(shortRange(at(11), at(12))).toBe('11 am–noon');
  });

  it('formats durations', () => {
    expect(formatDuration(45 * 60_000)).toBe('45 min');
    expect(formatDuration(2 * 3_600_000)).toBe('2 h');
    expect(formatDuration(3 * 3_600_000 + 12 * 60_000)).toBe('3 h 12 min');
    expect(formatDuration(-5)).toBe('0 min');
  });
});

describe('units', () => {
  it('round-trips imperial values back to metric storage', () => {
    expect(fromDisplayLength(toDisplayLength(50, 'imperial'), 'imperial')).toBeCloseTo(50, 0);
    expect(fromDisplayDepth(toDisplayDepth(6, 'imperial'), 'imperial')).toBeCloseTo(6, 0);
    expect(toDisplayLength(50, 'metric')).toBe(50);
  });
});

describe('labels', () => {
  it('shortens lake names for pins', () => {
    expect(shortLakeName('Lake of the Woods')).toBe('Woods');
    expect(shortLakeName('Bay of Quinte')).toBe('Quinte');
    expect(shortLakeName('Lake Erie')).toBe('Erie');
    expect(shortLakeName('Rainy Lake')).toBe('Rainy');
    expect(shortLakeName('French River')).toBe('French');
  });

  it('maps engine reasons to icons and tone', () => {
    expect(reasonIcon('Fast light transition')).toBe('transition');
    expect(reasonIcon('Overcast softens the light')).toBe('cloud');
    expect(reasonIcon('Something new')).toBe('info');
    expect(reasonIsNegative('Bright conditions may slow activity')).toBe(true);
    expect(reasonIsNegative('Stable pressure')).toBe(false);
  });
});
