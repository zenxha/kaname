/** Sentences the ticket needs: how a picked station compares, and when the group has to leave. */
import type { CandidateResult, StationInfo } from "../../core/types";

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

export interface LastTrain {
  /** Minutes after midnight of the service day. */
  readonly time: number;
  /** Everyone whose last train home leaves then. */
  readonly labels: readonly string[];
}

/**
 * The end the app proposes for a station: the first last train home among the group. The last train
 * never moves the meeting (people check it once they are there), so it is only reported.
 */
export function earliestLastTrain(c: { readonly people: readonly { readonly label: string; readonly lastDeparture: number | null }[] }): LastTrain | null {
  const times = c.people.flatMap((p) => (p.lastDeparture === null ? [] : [p.lastDeparture]));
  if (times.length === 0) return null;
  const time = Math.min(...times);
  return { time, labels: c.people.filter((p) => p.lastDeparture === time).map((p) => p.label) };
}
