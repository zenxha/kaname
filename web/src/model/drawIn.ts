/** The "lines arrive" animation: each route grows from the person's station to the meeting point. */
import type { LngLat } from "./geometry";

export interface Leg {
  readonly path: readonly LngLat[];
  readonly walk: boolean;
  readonly color: string;
}

export const DRAW_MIN_MS = 500;
export const DRAW_MAX_MS = 1000;
export const DRAW_STAGGER_MS = 80;
/** Rides of this many minutes or more draw in the longest time. */
const LONG_RIDE_MIN = 90;

export function drawDuration(minutes: number): number {
  const share = Math.min(Math.max(minutes, 0), LONG_RIDE_MIN) / LONG_RIDE_MIN;
  return DRAW_MIN_MS + share * (DRAW_MAX_MS - DRAW_MIN_MS);
}

export const easeOut = (t: number): number => 1 - (1 - t) ** 3;

/** Planar distance; east-west degrees shrink with the latitude (Tokyo is near 35.7°). */
function distance(a: LngLat, b: LngLat): number {
  const k = Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
  return Math.hypot((b[0] - a[0]) * k, b[1] - a[1]);
}

function pathLength(path: readonly LngLat[]): number {
  return path.slice(1).reduce((sum, p, i) => sum + distance(path[i]!, p), 0);
}

/** The start of a path, `budget` long. */
function cut(path: readonly LngLat[], budget: number): LngLat[] {
  const out: LngLat[] = [path[0]!];
  let left = budget;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const d = distance(a, b);
    if (d >= left) {
      const f = d === 0 ? 0 : left / d;
      return [...out, [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]];
    }
    out.push(b);
    left -= d;
  }
  return out;
}

/** The legs drawn so far when a share `fraction` (0 to 1) of the whole route is drawn. */
export function partialLegs(legs: readonly Leg[], fraction: number): Leg[] {
  const f = Math.min(Math.max(fraction, 0), 1);
  if (f >= 1) return [...legs];
  const lengths = legs.map((l) => pathLength(l.path));
  let budget = f * lengths.reduce((a, b) => a + b, 0);
  const drawn: Leg[] = [];
  for (const [i, leg] of legs.entries()) {
    if (budget <= 0) break;
    drawn.push(budget >= lengths[i]! ? leg : { ...leg, path: cut(leg.path, budget) });
    budget -= lengths[i]!;
  }
  return drawn;
}
