/**
 * The shareable link: the whole plan in the query string, as station ids and settings only.
 * Names and locations stay on the device; a location travels as the station it snapped to.
 *
 *   ?p=seiseki-sakuragaoka&p=kanazawa-hakkei.yokohama&fair=75&end=2330&at=tokyo
 *
 * p: one per person, the start station, and ".home" when home is another station.
 * fair: the slider, 0 (efficient) to 100 (fair); 50 is left out. end: the meeting end as HHMM.
 * at: a station picked from the ranking.
 */
import { MAX_PARTICIPANTS } from "../../core/participants";
import { formatClock, parseClock } from "../../core/time";
import type { Person } from "./scenario";

export interface SharedPerson {
  readonly start: string;
  readonly home: string | null;
}

export interface Plan {
  readonly people: readonly SharedPerson[];
  /** Efficient (1) to fair (0), as the engine takes it. */
  readonly alpha: number;
  readonly meetingEnd: number | null;
  readonly at: string | null;
}

const KEYS = ["p", "fair", "end", "at"] as const;
const DEFAULT_FAIR = 50;
const HOME_SEPARATOR = ".";

/** The plan's query string, keeping any other parameters already in `keep` (such as basemap=none). */
export function encodePlan(plan: Plan, keep: URLSearchParams): string {
  const params = new URLSearchParams([...keep].filter(([k]) => !(KEYS as readonly string[]).includes(k)));
  for (const p of plan.people) params.append("p", p.home === null || p.home === p.start ? p.start : `${p.start}${HOME_SEPARATOR}${p.home}`);
  const fair = Math.round((1 - plan.alpha) * 100);
  if (fair !== DEFAULT_FAIR) params.set("fair", String(fair));
  if (plan.meetingEnd !== null) params.set("end", formatClock(plan.meetingEnd).replace(":", ""));
  if (plan.at !== null) params.set("at", plan.at);
  const text = params.toString();
  return text === "" ? "" : `?${text}`;
}

export interface Decoded {
  /** null when the link has no people: the app opens on its example. */
  readonly plan: Plan | null;
  /** Stations in the link that the data does not have. */
  readonly unknown: number;
}

function readFair(text: string | null): number {
  const n = text !== null && /^\d{1,3}$/.test(text) ? Number(text) : DEFAULT_FAIR;
  return n <= 100 ? n : DEFAULT_FAIR;
}

function readEnd(text: string | null): number | null {
  if (text === null || !/^\d{4}$/.test(text)) return null;
  try {
    return parseClock(`${text.slice(0, 2)}:${text.slice(2)}`);
  } catch {
    return null;
  }
}

/** Reads a link. Every value is checked: unknown stations are dropped and counted, bad settings fall back. */
export function decodePlan(search: string, isStation: (id: string) => boolean): Decoded {
  const params = new URLSearchParams(search);
  let unknown = 0;
  const known = (id: string): boolean => {
    const ok = isStation(id);
    if (!ok) unknown += 1;
    return ok;
  };
  const people = params.getAll("p").slice(0, MAX_PARTICIPANTS).flatMap((value): SharedPerson[] => {
    const [start = "", home] = value.split(HOME_SEPARATOR);
    if (!known(start)) return [];
    return [{ start, home: home !== undefined && known(home) && home !== start ? home : null }];
  });
  const atText = params.get("at");
  const at = atText !== null && known(atText) ? atText : null;
  if (people.length === 0) return { plan: null, unknown };
  return { plan: { people, alpha: 1 - readFair(params.get("fair")) / 100, meetingEnd: readEnd(params.get("end")), at }, unknown };
}

/**
 * The plan of the people on screen. `snapped(i)` is the station person i's location snapped to, or null
 * when it has not snapped yet; such a person is left out. Names are never part of a plan.
 */
export function planOf(people: readonly Person[], snapped: (index: number) => string | null, alpha: number,
  meetingEnd: number | null, at: string | null): Plan {
  const shared = people.flatMap((p, i): SharedPerson[] => {
    if (p.start === null) return [];
    const start = "station" in p.start ? p.start.station : snapped(i);
    if (start === null) return [];
    const home = p.home !== null && "station" in p.home && p.home.station !== start ? p.home.station : null;
    return [{ start, home }];
  });
  return { people: shared, alpha, meetingEnd, at };
}

/** The people of a shared plan, unnamed; the app numbers them. */
export function peopleOf(plan: Plan): Person[] {
  return plan.people.map((p, i) => ({
    id: `p${i + 1}`, label: "", start: { station: p.start }, home: p.home === null ? null : { station: p.home },
  }));
}
