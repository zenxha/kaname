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

export interface PlainSummary {
  readonly average: number;
  readonly longest: { readonly label: string; readonly minutes: number };
  /**
   * Everyone's changes of train, there and back. The ranking counts each one as extra minutes, so a
   * station can rank first with longer plain trips but fewer changes; this number shows why.
   */
  readonly changes: number;
}

/** The group's average trip and its longest trip, in plain minutes. The first person wins a tie. */
export function plainSummary(c: CandidateResult): PlainSummary {
  const trips = c.people.map((p) => ({ label: p.label, minutes: tripMinutes(p) }));
  const longest = trips.reduce((a, b) => (b.minutes > a.minutes ? b : a), trips[0] ?? { label: "", minutes: 0 });
  const average = trips.length === 0 ? 0 : trips.reduce((s, x) => s + x.minutes, 0) / trips.length;
  const changes = c.people.reduce((n, p) => n + p.outTransfers + p.homeTransfers, 0);
  return { average, longest, changes };
}

export function changesText(lang: Lang, n: number): string {
  return t(lang, n === 1 ? "changeOne" : "changesN", { n });
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
