/** Sentences the ticket needs: how a picked station compares, and which station a meeting end ruled out. */
import type { CandidateResult, RankResult, StationInfo } from "../../core/types";

export interface Comparison {
  /** The first-ranked station it is compared with. */
  readonly station: StationInfo;
  /** Rounded average minutes, picked minus first. */
  readonly average: number;
  /** Each person's round trip in minutes, picked minus first. */
  readonly people: readonly { readonly label: string; readonly minutes: number }[];
}

const roundTrip = (p: { readonly outMinutes: number; readonly homeMinutes: number }) => p.outMinutes + p.homeMinutes;

/** null when `shown` is the first station. Both results list the same people in the same order. */
export function compareToFirst(shown: CandidateResult, first: CandidateResult): Comparison | null {
  if (shown.station.id === first.station.id) return null;
  return {
    station: first.station,
    average: Math.round(shown.average) - Math.round(first.average),
    people: shown.people.map((p, i) => ({ label: p.label, minutes: roundTrip(p) - roundTrip(first.people[i] ?? p) })),
  };
}

export interface Dropped {
  readonly station: StationInfo;
  /** The people whose last train home leaves before the meeting ends. */
  readonly people: readonly { readonly label: string; readonly lastDeparture: number }[];
}

/** The station that ranks first without a meeting end, when the end rules it out; else null. */
export function droppedWinner(open: RankResult, current: RankResult, meetingEnd: number): Dropped | null {
  const winner = open.candidates[0];
  if (winner === undefined || current.candidates.some((c) => c.station.id === winner.station.id)) return null;
  const people = winner.people.flatMap((p) =>
    p.lastDeparture !== null && p.lastDeparture < meetingEnd ? [{ label: p.label, lastDeparture: p.lastDeparture }] : []);
  return { station: winner.station, people };
}
