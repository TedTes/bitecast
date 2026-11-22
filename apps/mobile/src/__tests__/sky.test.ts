import { describe, expect, it } from 'vitest';
import { mix, moonShadowPath, onScene, orbElevation, seeded, skyPalette, skyPhase } from '@/features/sky';

const luminance = (hex: string) =>
  [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    .reduce((total, c, i) => total + c * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a: string, b: string) => {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
};
const AA = 4.5;

const skies: { name: string; sky: ReturnType<typeof skyPalette> }[] = [];
for (let altitude = -30; altitude <= 70; altitude += 0.5) {
  for (let cloud = 0; cloud <= 100; cloud += 5) {
    for (const ice of [false, true]) skies.push({ name: `${altitude}°, ${cloud}%, ice ${ice}`, sky: skyPalette(altitude, cloud, ice) });
  }
}
const failures = (check: (sky: ReturnType<typeof skyPalette>) => number) => skies.filter(({ sky }) => check(sky) < AA).map(({ name }) => name);

describe('Today scene contrast', () => {
  it('keeps header text readable on every sky', () => {
    // Shoreline headers put text anywhere on the gradient between these two colours.
    expect(failures((sky) => Math.min(...[0, 0.25, 0.5, 0.75, 1].map((t) => contrast(onScene.text, mix(sky.top, sky.upper, t)))))).toEqual([]);
  });

  it('keeps timeline labels readable on the shore', () => {
    expect(failures((sky) => Math.min(contrast(onScene.text, sky.nearShore), contrast(onScene.accent, sky.nearShore)))).toEqual([]);
  });

  it('keeps the score readable on the sun and on both sides of the moon', () => {
    expect(
      failures((sky) => {
        const faces = [sky.orb.core, sky.orb.edge];
        if (sky.night) faces.push(mix(sky.orb.edge, '#3A4652', 0.3));
        return Math.min(...faces.map((face) => contrast(sky.orb.ink, face)));
      }),
    ).toEqual([]);
  });

  // Pure white is the worst case for anything passing behind: clouds, light rays or pale fish.
  it.each(['glass', 'deepGlass'] as const)('keeps %s text readable even over pure white', (surface) => {
    const [r, g, b, alpha] = onScene[surface].match(/[\d.]+/g)!.map(Number);
    const hex = `#${[r, g, b].map((c) => Math.round(c * alpha + 255 * (1 - alpha)).toString(16).padStart(2, '0')).join('')}`;
    for (const color of [onScene.text, onScene.soft, onScene.accent]) expect(contrast(color, hex)).toBeGreaterThanOrEqual(AA);
  });

  it('keeps text readable on the wooden sign', () => {
    for (const color of [onScene.text, onScene.soft, onScene.accent]) expect(contrast(color, onScene.woodLight)).toBeGreaterThanOrEqual(AA);
  });
});

describe('sky geometry', () => {
  it('swaps sun for moon after twilight and shows stars only in clear night skies', () => {
    expect(skyPalette(10, 0).night).toBe(false);
    expect(skyPalette(-20, 0).night).toBe(true);
    expect(skyPalette(-20, 0).stars).toBe(1);
    expect(skyPalette(-20, 100).stars).toBe(0);
    expect(skyPalette(30, 0).stars).toBe(0);
  });

  it('shows the sun only while it is up, then afterglow, then the moon', () => {
    expect([10, -0.2, -0.4, -3.9, -4.1].map(skyPhase)).toEqual(['sun', 'sun', 'afterglow', 'afterglow', 'moon']);
  });

  it('keeps the orb between the horizon and the top of its space', () => {
    expect(orbElevation(-10)).toBe(0);
    expect(orbElevation(90)).toBe(1);
  });

  it('shades the correct side of the moon', () => {
    // SVG sweep 0 from the top runs down the left-hand side.
    expect(moonShadowPath(50, 50, 40, 0.25, true)).toBe('M50 10 A40 40 0 0 0 50 90 A20 40 0 0 0 50 10 Z');
    expect(moonShadowPath(50, 50, 40, 0.75, true)).toBe('M50 10 A40 40 0 0 0 50 90 A20 40 0 0 1 50 10 Z');
    expect(moonShadowPath(50, 50, 40, 0.75, false)).toBe('M50 10 A40 40 0 0 1 50 90 A20 40 0 0 0 50 10 Z');
  });

  it('repeats scenery for the same seed', () => {
    const a = seeded(7);
    const b = seeded(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});
