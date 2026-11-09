/** Turn route hops into map coordinates along each railway's stations. */
import type { MatrixData } from "../../core/data";
import type { RouteHop } from "../../core/routes";

export type LngLat = readonly [number, number];

/** A station's position on one railway (its platform), else the station's centre. */
export function stationPoint(data: MatrixData, station: number, railway: number): LngLat {
  const s = data.stations[station]!;
  const stop = s.stops.find(([r]) => r === railway);
  return stop ? [stop[1], stop[2]] : [s.lng, s.lat];
}

/** Station indexes passed between positions a and b of a line, the short way round a loop. */
function stationRun(line: readonly number[], a: number, b: number, loop: boolean): number[] {
  const forward = a <= b ? line.slice(a, b + 1) : line.slice(b, a + 1).reverse();
  if (!loop) return forward;
  const n = line.length;
  const around = Array.from({ length: n - forward.length + 2 }, (_, i) => line[(((a <= b ? a - i : a + i) % n) + n) % n]!);
  return around.length < forward.length ? around : forward;
}

/** The path of one train ride, through every station on the railway between its two ends. */
export function hopPath(data: MatrixData, hop: RouteHop): LngLat[] {
  const rw = data.railways[hop.railway];
  const line = rw?.stations ?? [];
  const a = line.indexOf(hop.from);
  const b = line.indexOf(hop.to);
  if (a < 0 || b < 0) return [stationPoint(data, hop.from, hop.railway), stationPoint(data, hop.to, hop.railway)];
  return stationRun(line, a, b, rw?.loop === true).map((s) => stationPoint(data, s, hop.railway));
}

/** One continuous path for a whole route. A walk between stations becomes a straight step. */
export function routePath(data: MatrixData, hops: readonly RouteHop[]): LngLat[] {
  return hops.reduce<LngLat[]>((path, hop) => {
    const next = hopPath(data, hop);
    const last = path.at(-1);
    const first = next[0];
    const same = last !== undefined && first !== undefined && last[0] === first[0] && last[1] === first[1];
    return [...path, ...(same ? next.slice(1) : next)];
  }, []);
}
