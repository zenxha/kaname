/**
 * rank(participants, options, data) -> ranked meeting stations.
 *
 *   c_i(X) = t(s_i -> X) + t(X -> h_i) + lambda * transfers_i(X) + w_i
 *   S(X) = sum_i c_i(X)     M(X) = max_i c_i(X)
 *   J(X) = alpha * S(X) / N + (1 - alpha) * M(X)
 *
 * A coordinate snaps to 3 stations; each leg takes its cheapest option. With a meeting end,
 * a home option counts only if its last train leaves at or after the end.
 * Ties: more lines first, then lower spread, then station id.
 */
import { SAME_STATION, UNREACHABLE, type MatrixData } from "./data";
import { RankError } from "./errors";
import { publicParticipant, resolveParticipants, type Resolved } from "./participants";
import { describeStation, stationInfo } from "./stations";
import { formatClock } from "./time";
import type { CandidateResult, Exclusion, ParetoPoint, ParticipantInput, PersonResult, RankOptions, RankResult } from "./types";

export const DEFAULT_ALPHA = 0.5;
export const DEFAULT_LAMBDA = 5;
export const DEFAULT_LIMIT = 10;
const MAX_LAMBDA = 60;
const EPS = 1e-9;

interface Settings {
  readonly alpha: number;
  readonly lambda: number;
  readonly meetingEnd: number | null;
  readonly limit: number;
  readonly ignoreHome: boolean;
}

type Scored = { readonly ok: true; readonly result: Omit<CandidateResult, "rank"> } | { readonly ok: false; readonly exclusion: Exclusion };

function badOption(message: string): never {
  throw new RankError("BAD_OPTION", message);
}

function settings(o: RankOptions): Settings {
  const alpha = o.alpha ?? DEFAULT_ALPHA;
  const lambda = o.lambda ?? DEFAULT_LAMBDA;
  const limit = o.limit ?? DEFAULT_LIMIT;
  if (typeof alpha !== "number" || !(alpha >= 0 && alpha <= 1)) badOption("alpha must be between 0 and 1");
  if (typeof lambda !== "number" || !(lambda >= 0 && lambda <= MAX_LAMBDA)) {
    badOption(`lambda must be between 0 and ${MAX_LAMBDA} minutes`);
  }
  if (!Number.isInteger(limit) || limit < 1) badOption("limit must be a whole number of at least 1");
  const end = o.meetingEnd;
  if (end !== undefined && !(Number.isInteger(end) && end >= 0 && end < 48 * 60)) {
    badOption("meetingEnd must be whole minutes after 00:00 of the service day");
  }
  return { alpha, lambda, meetingEnd: end ?? null, limit, ignoreHome: o.ignoreHome === true };
}

interface Leg {
  readonly station: number;
  readonly minutes: number;
  readonly transfers: number;
  readonly walk: number;
  readonly cost: number;
  readonly lastDeparture: number | null;
}

function outLeg(data: MatrixData, r: Resolved, k: number, lambda: number): Leg | null {
  let best: Leg | null = null;
  for (const o of r.start) {
    const cell = o.index * data.nCandidates + k;
    const minutes = data.outMin[cell]!;
    if (minutes === UNREACHABLE) continue;
    const transfers = data.outXfer[cell]!;
    const cost = minutes + lambda * transfers + o.walkMinutes;
    if (best === null || cost < best.cost) {
      best = { station: o.index, minutes, transfers, walk: o.walkMinutes, cost, lastDeparture: null };
    }
  }
  return best;
}

/** Cheapest home option, or a reason why there is none. */
function homeLeg(data: MatrixData, r: Resolved, k: number, s: Settings): Leg | string {
  let best: Leg | null = null;
  let latest = -1;
  let reachable = false;
  for (const o of r.home) {
    const cell = k * data.nStations + o.index;
    const minutes = data.homeMin[cell]!;
    if (minutes === UNREACHABLE) continue;
    reachable = true;
    const last = data.lastDep[cell]!;
    const lastDeparture = last === SAME_STATION || last === UNREACHABLE ? null : last;
    if (lastDeparture !== null) latest = Math.max(latest, lastDeparture);
    const feasible = s.meetingEnd === null || last === SAME_STATION || (lastDeparture !== null && lastDeparture >= s.meetingEnd);
    if (!feasible) continue;
    const transfers = data.homeXfer[cell]!;
    const cost = minutes + s.lambda * transfers + o.walkMinutes;
    if (best === null || cost < best.cost) {
      best = { station: o.index, minutes, transfers, walk: o.walkMinutes, cost, lastDeparture };
    }
  }
  if (best !== null) return best;
  const home = describeStation(data.stations[r.home[0]!.index]!);
  if (!reachable) return `${r.label} has no train home to ${home} in the 21:00-23:00 window`;
  const when = latest < 0 ? "no train after 21:00" : `the last train leaves at ${formatClock(latest)}`;
  return `${r.label}'s last train home to ${home}: ${when}, before the meeting ends at ${formatClock(s.meetingEnd ?? 0)}`;
}

function lastTrainOk(lastDeparture: number | null, meetingEnd: number | null): boolean | null {
  if (meetingEnd === null) return null;
  return lastDeparture === null || lastDeparture >= meetingEnd;
}

function person(data: MatrixData, r: Resolved, out: Leg, home: Leg, s: Settings): PersonResult {
  return {
    label: r.label,
    startStation: data.stations[out.station]!.id,
    homeStation: data.stations[home.station]!.id,
    outMinutes: out.minutes,
    homeMinutes: home.minutes,
    outTransfers: out.transfers,
    homeTransfers: home.transfers,
    walkMinutes: out.walk + home.walk,
    cost: out.cost + home.cost,
    lastDeparture: home.lastDeparture,
    lastTrainOk: lastTrainOk(home.lastDeparture, s.meetingEnd),
  };
}

function noHome(k: number): Leg {
  return { station: k, minutes: 0, transfers: 0, walk: 0, cost: 0, lastDeparture: null };
}

function aggregate(people: readonly PersonResult[], alpha: number): Omit<CandidateResult, "rank" | "station" | "people"> {
  const costs = people.map((p) => p.cost).sort((a, b) => a - b); // canonical order: exact, order-free sums
  const total = costs.reduce((a, b) => a + b, 0);
  const max = costs[costs.length - 1]!;
  const worstLabel = people.filter((p) => p.cost === max).map((p) => p.label).sort()[0]!;
  const average = total / costs.length;
  return { objective: alpha * average + (1 - alpha) * max, total, average, worst: { label: worstLabel, cost: max },
    spread: max - costs[0]! };
}

function scoreCandidate(data: MatrixData, group: readonly Resolved[], k: number, s: Settings): Scored {
  const station = stationInfo(data.stations[k]!);
  const reasons: string[] = [];
  const people: PersonResult[] = [];
  for (const r of group) {
    const out = outLeg(data, r, k, s.lambda);
    const home = s.ignoreHome ? noHome(k) : homeLeg(data, r, k, s);
    if (out === null) reasons.push(`${r.label} cannot reach ${describeStation(data.stations[k]!)} in the 17:30-19:30 window`);
    if (typeof home === "string") reasons.push(home);
    if (out !== null && typeof home !== "string") people.push(person(data, r, out, home, s));
  }
  if (reasons.length > 0) return { ok: false, exclusion: { station, reasons } };
  return { ok: true, result: { station, people, ...aggregate(people, s.alpha) } };
}

function compare(a: Omit<CandidateResult, "rank">, b: Omit<CandidateResult, "rank">): number {
  if (Math.abs(a.objective - b.objective) > EPS) return a.objective - b.objective;
  if (a.station.lines !== b.station.lines) return b.station.lines - a.station.lines;
  if (Math.abs(a.spread - b.spread) > EPS) return a.spread - b.spread;
  return a.station.id < b.station.id ? -1 : a.station.id > b.station.id ? 1 : 0;
}

/** Candidates that no other candidate beats on both average and worst case. */
export function paretoSet(cands: readonly Omit<CandidateResult, "rank">[]): ParetoPoint[] {
  const dominated = (p: Omit<CandidateResult, "rank">) =>
    cands.some((q) => q.average <= p.average && q.worst.cost <= p.worst.cost &&
      (q.average < p.average || q.worst.cost < p.worst.cost));
  return cands
    .filter((p) => !dominated(p))
    .map((p) => ({ station: p.station, average: p.average, worst: p.worst.cost }))
    .sort((a, b) => a.average - b.average || a.worst - b.worst || (a.station.id < b.station.id ? -1 : 1));
}

export function rank(participants: readonly ParticipantInput[], options: RankOptions, data: MatrixData): RankResult {
  const s = settings(options);
  const group = resolveParticipants(data, participants, !s.ignoreHome);
  const scored = Array.from({ length: data.nCandidates }, (_, k) => scoreCandidate(data, group, k, s));
  const feasible = scored.flatMap((x) => (x.ok ? [x.result] : [])).sort(compare);
  return {
    candidates: feasible.slice(0, s.limit).map((c, i) => ({ rank: i + 1, ...c })),
    feasibleCount: feasible.length,
    excluded: scored.flatMap((x) => (x.ok ? [] : [x.exclusion])),
    pareto: paretoSet(feasible),
    participants: group.map((r) => publicParticipant(data, r)),
  };
}
