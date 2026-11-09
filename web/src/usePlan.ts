/** Derived state: rank the group, pick the shown candidate, and build what the map draws. */
import { useMemo } from "react";
import type { MatrixData } from "../core/data";
import { RankError } from "../core/errors";
import { rank } from "../core/rank";
import { routeInBlock, type RouteHop } from "../core/routes";
import type { CandidateResult, RankResult } from "../core/types";
import type { Blocks } from "./data/useAppData";
import type { MapPerson, MapStation } from "./map/types";
import { routeLegs, routePath, stationPoint, type LngLat, type MapLeg } from "./model/geometry";
import { toParticipants, type Person } from "./model/scenario";

export type Outcome =
  | { readonly kind: "needTwo" }
  | { readonly kind: "error"; readonly error: RankError }
  | {
    readonly kind: "ok";
    readonly result: RankResult;
    /** The station on show: the picked one, else the first. */
    readonly best: CandidateResult | null;
  };

/** Station index of an id the engine returned; a miss means the data and the engine disagree. */
export function stationIndex(data: MatrixData, id: string): number {
  const i = data.byId.get(id);
  if (i === undefined) throw new Error(`station "${id}" is missing from the loaded data`);
  return i;
}

/** `unnamed` names a person who has no name, by their number in the list. */
export function useOutcome(data: MatrixData, people: readonly Person[], alpha: number, selected: string | null,
  unnamed: (n: number) => string): Outcome {
  return useMemo((): Outcome => {
    const participants = toParticipants(people, unnamed);
    if (participants.length < 2) return { kind: "needTwo" };
    try {
      const result = rank(participants, { alpha }, data);
      const best = result.candidates.find((c) => c.station.id === selected) ?? result.candidates[0] ?? null;
      return { kind: "ok", result, best };
    } catch (e) {
      if (e instanceof RankError) return { kind: "error", error: e };
      throw e;
    }
  }, [data, people, alpha, selected, unnamed]);
}

export interface PersonRoute {
  readonly out: readonly RouteHop[];
  readonly home: readonly RouteHop[];
}

/** Each person's exact outbound and home route to the shown candidate (empty until its block loads). */
export function personRoutes(data: MatrixData, best: CandidateResult | null, blocks: Blocks | null): PersonRoute[] {
  if (best === null) return [];
  const k = stationIndex(data, best.station.id);
  return best.people.map((p) => {
    if (blocks === null || blocks.candidate !== k) return { out: [], home: [] };
    return {
      out: routeInBlock(blocks.out, "out", k, stationIndex(data, p.startStation), data.nStations),
      home: routeInBlock(blocks.home, "home", k, stationIndex(data, p.homeStation), data.nStations),
    };
  });
}

export function centre(data: MatrixData, id: string): LngLat {
  const s = data.stations[stationIndex(data, id)]!;
  return [s.lng, s.lat];
}

/** Drawn when a route block fails to load. */
const STRAIGHT_COLOR = "#8a8f96";

function outLegs(data: MatrixData, hops: readonly RouteHop[], from: string, to: string, straight: boolean): MapLeg[] {
  if (hops.length > 0) return routeLegs(data, hops);
  if (!straight || from === to) return [];
  return [{ path: [centre(data, from), centre(data, to)], walk: false, color: STRAIGHT_COLOR }];
}

function homePath(data: MatrixData, hops: readonly RouteHop[], p: CandidateResult["people"][number], meet: string, straight: boolean): LngLat[] {
  if (p.homeStation === p.startStation || p.homeStation === meet) return [];
  if (hops.length > 0) return routePath(data, hops);
  return straight ? [centre(data, meet), centre(data, p.homeStation)] : [];
}

function hopStart(data: MatrixData, hops: readonly RouteHop[], fallback: string): LngLat {
  const h = hops[0];
  return h ? stationPoint(data, h.from, h.railway) : centre(data, fallback);
}

/** Positions in `people` of the people the engine scores (those with a start), in engine order. */
export function scoredIndexes(people: readonly Person[]): number[] {
  return people.flatMap((p, i) => (p.start === null ? [] : [i]));
}

/**
 * What the map draws per person. The number follows the person's place in the list.
 * `straight`: the route block failed, so draw straight lines instead of nothing.
 */
export function buildMapPeople(data: MatrixData, best: CandidateResult | null, routes: readonly PersonRoute[],
  people: readonly Person[], straight: boolean): MapPerson[] {
  if (best === null) return [];
  const slots = scoredIndexes(people);
  return best.people.map((p, j) => {
    const r = routes[j] ?? { out: [], home: [] };
    const idx = slots[j] ?? j;
    return {
      id: people[idx]?.id ?? `#${j}`,
      number: idx + 1,
      label: p.label,
      minutes: p.outMinutes,
      start: hopStart(data, r.out, p.startStation),
      legs: outLegs(data, r.out, p.startStation, best.station.id, straight),
      home: homePath(data, r.home, p, best.station.id, straight),
    };
  });
}

export function toMapStation(data: MatrixData, c: CandidateResult, name: string): MapStation {
  return { id: c.station.id, rank: c.rank, at: centre(data, c.station.id), name };
}

/** Changes only when the people or the shown station change. */
export function fitKey(best: CandidateResult | null): string {
  return best === null ? "" : [best.station.id, ...best.people.map((p) => `${p.startStation}>${p.homeStation}`)].join("|");
}
