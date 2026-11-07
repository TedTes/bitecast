import { describe, expect, it } from 'vitest';
import { typicalSeason } from '../src';

const at = (iso: string) => new Date(`${iso}T12:00:00`);

describe('typical season by latitude', () => {
  it('treats summer as open water everywhere', () => {
    expect(typicalSeason(49.1, at('2026-07-01'))).toBe('open_water');
    expect(typicalSeason(42.2, at('2026-07-01'))).toBe('open_water');
  });

  it('starts ice season earlier and ends it later in the north', () => {
    expect(typicalSeason(49.1, at('2026-12-05'))).toBe('ice');
    expect(typicalSeason(44.4, at('2026-12-05'))).toBe('open_water');
    expect(typicalSeason(49.1, at('2027-04-10'))).toBe('ice');
    expect(typicalSeason(46.2, at('2027-04-10'))).toBe('open_water');
  });

  it('wraps the new year for northern bands', () => {
    expect(typicalSeason(46.2, at('2026-12-31'))).toBe('ice');
    expect(typicalSeason(46.2, at('2027-01-15'))).toBe('ice');
  });

  it('keeps the southern Great Lakes window short', () => {
    expect(typicalSeason(42.2, at('2027-01-10'))).toBe('open_water');
    expect(typicalSeason(42.2, at('2027-02-01'))).toBe('ice');
    expect(typicalSeason(42.2, at('2027-03-05'))).toBe('open_water');
  });

  it('includes both boundary days', () => {
    expect(typicalSeason(44, at('2027-01-05'))).toBe('ice');
    expect(typicalSeason(44, at('2027-03-20'))).toBe('ice');
    expect(typicalSeason(44, at('2027-03-21'))).toBe('open_water');
  });
});
