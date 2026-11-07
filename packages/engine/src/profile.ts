import type { SpeciesProfile } from './types';

export const walleyeProfile: SpeciesProfile = {
  id: 'walleye',
  idealLightBand: {
    clear: [0.08, 0.28],
    stained: [0.16, 0.42],
    murky: [0.28, 0.62],
  },
  transitionWeight: 0.2,
  pressureWeight: 0.1,
  moonWeight: 0.05,
  version: 'walleye-1.0.0',
  tactics: [
    { season: 'open_water', light: 'low', depth: 'shallow', text: 'Work the first break with a slow jig or subtle crankbait.' },
    { season: 'open_water', light: 'mid', depth: 'mid', text: 'Follow the weed edge or contour with a controlled troll.' },
    { season: 'open_water', light: 'high', depth: 'deep', text: 'Focus deeper structure and keep the presentation tight to bottom.' },
    { season: 'ice', light: 'low', depth: 'shallow', text: 'Set up near a travel edge and use a quiet, compact presentation.' },
    { season: 'ice', light: 'mid', depth: 'mid', text: 'Hole-hop the break and pause longer between lifts.' },
    { season: 'ice', light: 'high', depth: 'deep', text: 'Probe deeper structure with a vertical jig near bottom.' },
  ],
};
