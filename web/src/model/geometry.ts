/** Turn route hops into map coordinates: along the track where shapes.json has it, else station to station. */
import type { MatrixData } from "../../core/data";
import type { RouteHop } from "../../core/routes";
import type { TrackShapes } from "./shapes";

export type LngLat = readonly [number, number];

/** A station's position on one railway (its platform), else the station's centre. */
export function stationPoint(data: MatrixData, station: number, railway: number): LngLat {
  const s = data.stations[station]!;
  const stop = s.stops.find(([r]) => r === railway);
  return stop ? [stop[1], stop[2]] : [s.lng, s.lat];
}

/** Positions on a line of n stations passed between positions a and b, the short way round a loop. */
function positionRun(n: number, a: number, b: number, loop: boolean): number[] {
  const step = a <= b ? 1 : -1;
  const forward = Array.from({ length: Math.abs(b - a) + 1 }, (_, i) => a + i * step);
  if (!loop) return forward;
  const around = Array.from({ length: n - forward.length + 2 }, (_, i) => (((a - i * step) % n) + n) % n);
  return around.length < forward.length ? around : forward;
}

/**
 * The track from position p to the next position q: the pair's shape, reversed for a ride the other way.
 * Pair i joins positions i and i + 1. On a loop line, pair n - 1 joins the last position and the first.
 */
function trackStep(tracks: readonly (readonly LngLat[] | null)[], n: number, p: number, q: number): readonly LngLat[] | null {
  const pair = q === p + 1 ? p : q === p - 1 ? q : p === n - 1 && q === 0 ? n - 1 : p === 0 && q === n - 1 ? n - 1 : -1;
  const shape = tracks[pair] ?? null;
  if (shape === null) return null;
  return pair === p || (pair === n - 1 && p === n - 1) ? shape : [...shape].reverse();
}

function withoutRepeats(path: readonly LngLat[]): LngLat[] {
  return path.filter((pt, i) => i === 0 || pt[0] !== path[i - 1]![0] || pt[1] !== path[i - 1]![1]);
}

function positionsOf(line: readonly number[], station: number): number[] {
  return line.flatMap((s, i) => (s === station ? [i] : []));
}

/**
 * The path of one train ride, through every station on the railway between its two ends. A line can list
 * a station twice (the Oedo line's 都庁前), so the ride takes the nearest pair of stops. With track shapes,
 * it follows the track between the stations and still starts and ends at the two platforms.
 */
export function hopPath(data: MatrixData, hop: RouteHop, shapes?: TrackShapes | null): LngLat[] {
  const rw = data.railways[hop.railway];
  const line = rw?.stations ?? [];
  const runs = positionsOf(line, hop.from).flatMap((a) =>
    positionsOf(line, hop.to).map((b) => positionRun(line.length, a, b, rw?.loop === true)));
  if (runs.length === 0) return [stationPoint(data, hop.from, hop.railway), stationPoint(data, hop.to, hop.railway)];
  const run = runs.reduce((best, r) => (r.length < best.length ? r : best));
  const at = (pos: number) => stationPoint(data, line[pos]!, hop.railway);
  const tracks = shapes?.[hop.railway];
  if (!tracks) return run.map(at);
  const inner = run.slice(1).flatMap((q, i) => trackStep(tracks, line.length, run[i]!, q) ?? [at(run[i]!), at(q)]);
  return withoutRepeats([at(run[0]!), ...inner, at(run.at(-1)!)]);
}

export interface MapLeg {
  readonly path: readonly LngLat[];
  /** A walk between two stations, drawn as a dotted straight step. */
  readonly walk: boolean;
  /** The line's own color; a walk keeps the color of the line it walks to. */
  readonly color: string;
}

/** A route as map legs: each train ride in its line's color, and each walk between stations as a step. */
export function routeLegs(data: MatrixData, hops: readonly RouteHop[], shapes?: TrackShapes | null): MapLeg[] {
  return hops.flatMap((hop, i): MapLeg[] => {
    const color = data.railways[hop.railway]?.color ?? "#888888";
    const ride: MapLeg = { path: hopPath(data, hop, shapes), walk: false, color };
    const prev = hops[i - 1];
    if (!hop.walk || prev === undefined) return [ride];
    const from = stationPoint(data, prev.to, prev.railway);
    return [{ path: [from, ride.path[0]!], walk: true, color }, ride];
  });
}

/** One continuous path for a whole route. A walk between stations becomes a straight step. */
export function routePath(data: MatrixData, hops: readonly RouteHop[], shapes?: TrackShapes | null): LngLat[] {
  return hops.reduce<LngLat[]>((path, hop) => {
    const next = hopPath(data, hop, shapes);
    const last = path.at(-1);
    const first = next[0];
    const same = last !== undefined && first !== undefined && last[0] === first[0] && last[1] === first[1];
    return [...path, ...(same ? next.slice(1) : next)];
  }, []);
}
