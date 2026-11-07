import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useFrameCallback, useReducedMotion, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { WalleyeArt } from './walleye';

export type Mood = 'active' | 'idle' | 'sleepy';
const level: Record<Mood, number> = { sleepy: 0, idle: 1, active: 2 };

type Fish = {
  x: number; y: number; targetY: number;
  /** Heading the fish wants (−1 / 1) and its current facing, eased through 0 for a 3D-looking turn. */
  dir: number; facing: number;
  speed: number; size: number; phase: number;
  /** 0 = near (larger, clearer) … 1 = far (smaller, fainter). */
  depth: number;
  turnIn: number;
  /** Seconds left before this fish dwindles away and reappears elsewhere. */
  life: number;
  /** Visibility 0…1, eased toward 1 while alive and 0 while dwindling. */
  alpha: number;
  fading: boolean;
};

const FISH_ASPECT = 110 / 240; // WalleyeArt viewBox
function lifespan() {
  'worklet';
  return 7 + Math.random() * 14;
}

/** Pick the candidate spot farthest from every other fish (cheap Poisson-style spacing). */
function roomiest(fish: Fish[], self: Fish, width: number, top: number, room: number) {
  'worklet';
  let bestX = Math.random() * width;
  let bestY = top + Math.random() * room;
  let bestScore = -1;
  for (let k = 0; k < 8; k += 1) {
    const x = self.size * 0.2 + Math.random() * Math.max(1, width - self.size * 1.2);
    const y = top + Math.random() * room;
    let nearest = Number.MAX_VALUE;
    for (const other of fish) {
      if (other === self || other.alpha < 0.1) continue;
      const dx = (other.x - x) / Math.max(1, width);
      const dy = (other.y - y) / Math.max(1, room + 1);
      nearest = Math.min(nearest, dx * dx + dy * dy * 3);
    }
    if (nearest > bestScore) { bestScore = nearest; bestX = x; bestY = y; }
  }
  return { x: bestX, y: bestY };
}

/**
 * Subtle school of walleye spread across the whole lake. Fish cruise back and forth,
 * occasionally turn with an eased (non-bouncing) turn, fade past the edges, and after a
 * random lifespan dwindle away and reappear somewhere roomy — often mid-lake — so the scene
 * stays evenly populated and never visibly repeats. `mood` changes behaviour, never count.
 */
export function LakeSchool({ width, top, bottom, mood, count = 10 }: { width: number; top: number; bottom: number; mood: Mood; count?: number }) {
  const reduced = useReducedMotion();
  const activity = useSharedValue(level[mood]);
  const band = bottom - top;

  const [initial] = useState<Fish[]>(() => {
    // Seed on a jittered grid so the very first frame is already well spread.
    const cols = Math.ceil(Math.sqrt(count * 2.2));
    const rows = Math.ceil(count / cols);
    return Array.from({ length: count }, (_, i) => {
      const depth = Math.random();
      const size = 46 - depth * 22 + Math.random() * 4;
      const room = Math.max(0, band - size * FISH_ASPECT);
      const col = i % cols, row = Math.floor(i / cols);
      const x = ((col + 0.15 + Math.random() * 0.7) / cols) * width - size / 2;
      const y = top + ((row + 0.15 + Math.random() * 0.7) / Math.max(1, rows)) * room;
      const dir = Math.random() < 0.5 ? -1 : 1;
      return {
        x, y, targetY: y, dir, facing: dir,
        speed: 8 + Math.random() * 12 - depth * 4,
        size, phase: Math.random() * Math.PI * 2, depth,
        turnIn: 3 + Math.random() * 9,
        life: 2 + Math.random() * 16, // staggered so they don't all renew together
        alpha: 1, fading: false,
      };
    });
  });
  const school = useSharedValue<Fish[]>(initial);

  useEffect(() => {
    activity.set(withTiming(level[mood], { duration: 900 }));
    // Nudge everyone to drift toward a depth that suits the new mood soon.
    school.modify((fish) => {
      'worklet';
      for (const f of fish) f.turnIn = Math.min(f.turnIn, 0.3 + Math.random() * 1.5);
      return fish;
    });
  }, [mood, activity, school]);

  useFrameCallback((frame) => {
    'worklet';
    const dt = Math.min(0.05, (frame.timeSincePreviousFrame ?? 16) / 1000);
    const a = activity.get(); // 0 sleepy … 2 active
    const pace = 0.2 + a * 0.55;
    const preferred = 1 - a / 2; // active → upper water, sleepy → lower water
    school.modify((fish) => {
      'worklet';
      for (const f of fish) {
        const h = f.size * FISH_ASPECT;
        const room = Math.max(0, band - h);

        // Occasional decisions: maybe turn, wander to a new depth.
        f.turnIn -= dt;
        if (f.turnIn <= 0) {
          f.turnIn = 4 + Math.random() * 10;
          if (Math.random() < 0.3) f.dir = -f.dir;
          const d = Math.min(1, Math.max(0, preferred * 0.6 + Math.random() * 0.55 - 0.15));
          f.targetY = top + d * room;
        }

        // Personal space: ease apart vertically from close neighbours (no stacked pairs).
        for (const other of fish) {
          if (other === f || other.alpha < 0.2) continue;
          const dx = Math.abs(other.x - f.x);
          const dy = other.y - f.y;
          if (dx < (f.size + other.size) * 0.55 && Math.abs(dy) < (h + other.size * FISH_ASPECT) * 0.8) {
            f.targetY = Math.min(top + room, Math.max(top, f.targetY - Math.sign(dy || 1) * 14 * dt * 10));
          }
        }

        // Eased turn: facing glides through 0; the fish slows while turning.
        f.facing += (f.dir - f.facing) * Math.min(1, dt * 2.2);
        const turning = 1 - Math.abs(f.facing);
        f.x += f.facing * f.speed * pace * (1 - turning * 0.7) * dt;
        f.y += (f.targetY - f.y) * Math.min(1, dt * 0.35);
        f.phase += dt * (1 + a * 2);

        // Lifespan: dwindle away in place, then reappear somewhere roomy.
        f.life -= dt;
        if (f.life <= 0 && !f.fading) f.fading = true;
        f.alpha += ((f.fading ? 0 : 1) - f.alpha) * Math.min(1, dt * (f.fading ? 0.9 : 0.7));

        const offEdge = f.x > width + f.size * 0.2 || f.x < -f.size * 1.2;
        if ((f.fading && f.alpha < 0.02) || offEdge) {
          const fromEdge = offEdge ? Math.random() < 0.5 : Math.random() < 0.25;
          if (fromEdge) {
            const fromLeft = Math.random() < 0.5;
            f.dir = fromLeft ? 1 : -1;
            f.x = fromLeft ? -f.size * 1.1 : width + f.size * 0.1;
            f.y = top + Math.random() * room;
            f.alpha = 1; // edge fade handles the entrance
          } else {
            const spot = roomiest(fish, f, width, top, room);
            f.x = spot.x;
            f.y = spot.y;
            f.dir = Math.random() < 0.5 ? -1 : 1;
            f.alpha = 0; // fades in mid-lake
          }
          f.facing = f.dir;
          f.targetY = f.y;
          f.speed = 8 + Math.random() * 12 - f.depth * 4;
          f.turnIn = 4 + Math.random() * 10;
          f.life = lifespan();
          f.fading = false;
        }
      }
      return fish;
    });
  }, !reduced);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} importantForAccessibility="no-hide-descendants">
      {initial
        .map((fish, i) => ({ fish, i }))
        .sort((a, b) => b.fish.depth - a.fish.depth) // far fish render first
        .map(({ fish, i }) => <SwimmingFish key={i} index={i} size={fish.size} width={width} school={school} />)}
    </View>
  );
}

function SwimmingFish({ index, size, width, school }: { index: number; size: number; width: number; school: SharedValue<Fish[]> }) {
  const style = useAnimatedStyle(() => {
    const f = school.get()[index];
    // Fade near the edges so fish dwindle away instead of hitting a wall.
    const fadeZone = f.size * 1.4;
    const centre = f.x + f.size / 2;
    const edge = Math.max(0, Math.min(1, Math.min(centre, width - centre) / fadeZone));
    const base = 0.22 + (1 - f.depth) * 0.38; // subtle: 0.22 far … 0.6 near
    const facing = Math.abs(f.facing) < 0.12 ? (f.facing < 0 ? -0.12 : 0.12) : f.facing;
    return {
      opacity: base * edge * f.alpha,
      transform: [
        { translateX: f.x },
        { translateY: f.y + Math.sin(f.phase) * 1.5 },
        { scaleX: facing },
        { rotate: `${Math.sin(f.phase * 1.3) * 2}deg` },
      ],
    };
  });
  return (
    <Animated.View style={[styles.fish, style]}>
      <WalleyeArt width={size} tone="light" contours={false} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fish: { position: 'absolute', top: 0, left: 0 },
});
