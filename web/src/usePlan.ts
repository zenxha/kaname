/** Derived state: rank the group, pick the shown candidate, and build what the map draws. */
import { useMemo } from "react";
import type { MatrixData } from "../core/data";
import { RankError } from "../core/errors";
import { rank } from "../core/rank";
import { routeInBlock, type RouteHop } from "../core/routes";
import type { CandidateResult, RankResult } from "../core/types";
import type { Blocks } from "./data/useAppData";
import { routePath, stationPoint, type LngLat } from "./model/geometry";
import { toParticipants, type Person } from "./model/scenario";

export type Outcome =
  | { readonly kind: "needTwo" }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "ok"; readonly result: RankResult; readonly best: CandidateResult | null };

export function useOutcome(data: MatrixData, people: readonly Person[], alpha: number, meetingEnd: number | null,
  selected: string | null): Outcome {
  return useMemo(() => {
    const participants = toParticipants(people);
    if (participants.length < 2) return { kind: "needTwo" };
    try {
      const options = meetingEnd === null ? { alpha } : { alpha, meetingEnd };
      const result = rank(participants, options, data);
      const best = result.candidates.find((c) => c.station.id === selected) ?? result.candidates[0] ?? null;
      return { kind: "ok", result, best };
    } catch (e) {
      if (e instanceof RankError) return { kind: "error", message: e.message };
      throw e;
    }
  }, [data, people, alpha, meetingEnd, selected]);
}

export interface PersonRoute {
  readonly out: readonly RouteHop[];
  readonly home: readonly RouteHop[];
}

/** Each person's exact outbound and home route to the shown candidate (empty until its block loads). */
export function usePersonRoutes(data: MatrixData, best: CandidateResult | null, blocks: Blocks | null): PersonRoute[] {
  return useMemo(() => {
    if (best === null) return [];
    const k = data.byId.get(best.station.id)!;
    return best.people.map((p) => {
      if (blocks === null || blocks.candidate !== k) return { out: [], home: [] };
      const s = data.byId.get(p.startStation)!;
      const h = data.byId.get(p.homeStation)!;
      return {
        out: routeInBlock(blocks.out, "out", k, s, data.nStations),
        home: routeInBlock(blocks.home, "home", k, h, data.nStations),
      };
    });
  }, [data, best, blocks]);
}

export function centre(data: MatrixData, id: string): LngLat {
  const s = data.stations[data.byId.get(id)!]!;
  return [s.lng, s.lat];
}

export function pathOrStraight(data: MatrixData, hops: readonly RouteHop[], from: string, to: string): LngLat[] {
  if (hops.length > 0) return routePath(data, hops);
  return from === to ? [] : [centre(data, from), centre(data, to)];
}

export function hopStart(data: MatrixData, hops: readonly RouteHop[], fallback: string): LngLat {
  const h = hops[0];
  return h ? stationPoint(data, h.from, h.railway) : centre(data, fallback);
}
