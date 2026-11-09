/** A route as the steps a rider takes: board, change, walk, stay on a through train, get off. */
import type { MatrixData } from "../../core/data";
import type { RouteHop } from "../../core/routes";

export type RideStep =
  | { readonly kind: "board"; readonly railway: number; readonly station: number }
  | { readonly kind: "change"; readonly railway: number; readonly station: number }
  | { readonly kind: "stay"; readonly railway: number; readonly station: number }
  | { readonly kind: "walk"; readonly railway: number; readonly from: number; readonly station: number }
  | { readonly kind: "arrive"; readonly station: number };

function sameLine(data: MatrixData, a: number, b: number): boolean {
  return a === b || data.railways[a]?.ja === data.railways[b]?.ja;
}

/** A hop that stays on the same line as the one before (a loop or a split line) is not a new ride. */
function continues(data: MatrixData, prev: RouteHop | undefined, hop: RouteHop): boolean {
  return prev !== undefined && hop.seated && !hop.walk && sameLine(data, prev.railway, hop.railway);
}

function step(prev: RouteHop | undefined, hop: RouteHop): RideStep {
  if (prev === undefined) return { kind: "board", railway: hop.railway, station: hop.from };
  if (hop.walk) return { kind: "walk", railway: hop.railway, from: prev.to, station: hop.from };
  if (hop.seated) return { kind: "stay", railway: hop.railway, station: hop.from };
  return { kind: "change", railway: hop.railway, station: hop.from };
}

export function rideSteps(data: MatrixData, hops: readonly RouteHop[]): RideStep[] {
  if (hops.length === 0) return [];
  const rides = hops.flatMap((hop, i) => (continues(data, hops[i - 1], hop) ? [] : [step(hops[i - 1], hop)]));
  return [...rides, { kind: "arrive", station: hops.at(-1)!.to }];
}

export type Ride = Exclude<RideStep, { readonly kind: "arrive" }>;

/** The rides of a trip: every step but the last, which is getting off. */
export function rides(steps: readonly RideStep[]): Ride[] {
  return steps.filter((s): s is Ride => s.kind !== "arrive");
}

/** The railways a trip rides, in order, each ride once. */
export function rideRailways(steps: readonly RideStep[]): number[] {
  return rides(steps).map((s) => s.railway);
}
