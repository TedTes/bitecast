import { describe, expect, it } from 'vitest';
import { formatDay, formatDayInline } from '@/lib/format';

describe('formatDayInline', () => {
  const now = new Date(2026, 10, 22, 8);

  it('lowercases relative days', () => {
    expect(formatDayInline(new Date(2026, 10, 22, 6), now)).toBe('today');
    expect(formatDayInline(new Date(2026, 10, 21, 6), now)).toBe('yesterday');
  });

  it('leaves dates capitalised', () => {
    const date = new Date(2026, 10, 7, 12);
    expect(formatDayInline(date, now)).toBe(formatDay(date, now));
  });
});
