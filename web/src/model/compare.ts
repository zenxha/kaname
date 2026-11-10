/** Sentences the ticket needs: how a picked station compares, and when the group has to leave. */
import type { CandidateResult, PersonResult, StationInfo } from "../../core/types";
import { t, type Lang } from "./i18n";

export interface Comparison {
  /** The first-ranked station it is compared with. */
  readonly station: StationInfo;
  /** Rounded average minutes, picked minus first. */
  readonly average: number;
  /** Each person's round trip in minutes, and their changes of train there and back, picked minus first. */
  readonly people: readonly { readonly label: string; readonly minutes: number; readonly changes: number }[];
}

const personChanges = (p: PersonResult): number => p.outTransfers + p.homeTransfers;

/**
 * A person's trip as a journey planner shows it: the ride there, the ride back and the walk from a
 * typed place. The engine's cost adds the transfer penalty, which only orders the stations.
 */
export function tripMinutes(p: PersonResult): number {
  return p.outMinutes + p.homeMinutes + p.walkMinutes;
}

/** One person's trip in plain minutes, with their changes of train there and back. */
export interface Hardest {
  readonly label: string;
  readonly minutes: number;
  readonly changes: number;
}

/**
 * The four numbers the ranking depends on, shown without the penalty. The ranking weighs the average
 * against the hardest trip, and counts each change of train as extra minutes in both. So a station
 * that ranks lower is never as good or better on all four.
 */
export interface PlainSummary {
  readonly average: number;
  /** Everyone's changes of train, there and back. */
  readonly changes: number;
  /** The ranking's worst trip: the most minutes once changes count. It can be shorter than the longest ride. */
  readonly hardest: Hardest;
}

export function plainSummary(c: CandidateResult): PlainSummary {
  const average = c.people.length === 0 ? 0 : c.people.reduce((s, p) => s + tripMinutes(p), 0) / c.people.length;
  const changes = c.people.reduce((n, p) => n + personChanges(p), 0);
  // The engine names the worst person; a repeated name is found by its cost too.
  const worst = c.people.find((p) => p.label === c.worst.label && p.cost === c.worst.cost) ?? c.people[0];
  const hardest = worst ? { label: worst.label, minutes: tripMinutes(worst), changes: personChanges(worst) } : { label: "", minutes: 0, changes: 0 };
  return { average, changes, hardest };
}

export function changesText(lang: Lang, n: number): string {
  return t(lang, n === 1 ? "changeOne" : "changesN", { n });
}

/**
 * A person's row: the ride there, the ride back and the walk from a typed place. The three add up to
 * the trip that the ticket counts.
 */
export function rowMinutes(lang: Lang, p: PersonResult): string {
  return [
    t(lang, "therePart", { n: p.outMinutes }),
    ...(p.homeMinutes > 0 ? [t(lang, "backPart", { n: p.homeMinutes })] : []),
    ...(p.walkMinutes > 0 ? [t(lang, "walkPart", { n: p.walkMinutes })] : []),
  ].join(" · ");
}

/** The group's changes of train, said so that they do not read as one person's. */
export function changesAllText(lang: Lang, n: number): string {
  return t(lang, n === 1 ? "changeOneAll" : "changesAll", { n });
}

/** The words after the hardest trip's minutes on the ticket. */
export function hardestText(lang: Lang, h: Hardest): string {
  return t(lang, "hardestWho", { who: h.label, changes: changesText(lang, h.changes) });
}

/** null when `shown` is the first station. Both results list the same people in the same order. */
export function compareToFirst(shown: CandidateResult, first: CandidateResult): Comparison | null {
  if (shown.station.id === first.station.id) return null;
  return {
    station: first.station,
    average: Math.round(plainSummary(shown).average) - Math.round(plainSummary(first).average),
    people: shown.people.map((p, i) => {
      const before = first.people[i] ?? p;
      return { label: p.label, minutes: tripMinutes(p) - tripMinutes(before), changes: personChanges(p) - personChanges(before) };
    }),
  };
}

function tripText(lang: Lang, p: Comparison["people"][number]): string {
  const trip = p.minutes === 0 ? t(lang, "tripSame", { who: p.label })
    : t(lang, p.minutes > 0 ? "tripLonger" : "tripShorter", { who: p.label, n: Math.abs(p.minutes) });
  if (p.changes === 0) return trip;
  const n = Math.abs(p.changes);
  const key = p.changes > 0 ? (n === 1 ? "oneMoreChange" : "moreChanges") : n === 1 ? "oneFewerChange" : "fewerChanges";
  const against = (p.minutes < 0 && p.changes > 0) || (p.minutes > 0 && p.changes < 0);
  return trip + t(lang, key, { n, join: t(lang, against ? "butJoin" : "andJoin") });
}

/** What changes for each person at a lower station: minutes, and changes of train when they differ. */
export function comparisonText(lang: Lang, c: Comparison): string {
  const station = lang === "ja" ? c.station.ja : c.station.en;
  const n = Math.abs(c.average);
  const average = c.average === 0 ? t(lang, "sameAverage", { station })
    : t(lang, c.average > 0 ? "moreAverage" : "lessAverage", { station, n });
  const trips = c.people.map((p) => tripText(lang, p));
  return lang === "ja" ? `${average}${trips.join("、")}。` : `${average} ${trips.join(", ")}.`;
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
