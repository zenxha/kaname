/**
 * The shareable link: the whole plan in the query string, as stations, names and settings.
 * A location never travels: it goes as the station it snapped to.
 *
 *   ?p=seiseki-sakuragaoka_Shizuku&p=kanazawa-hakkei.yokohama_Hitori&fair=75&at=tokyo
 *
 * p: one per person: the start station, ".home" when home is another station, and "_name" when the
 * person has a name. Station ids are a-z, 0-9 and "-", so everything after the first "_" is the name.
 * fair: the slider, 0 (efficient) to 100 (fair); 50 is left out. at: a station picked from the ranking.
 * There is no meeting end: the app proposes it (the first last train home), so older links' "end" is ignored.
 */
import { MAX_PARTICIPANTS } from "../../core/participants";
import type { Person } from "./scenario";

export interface SharedPerson {
  readonly start: string;
  readonly home: string | null;
  /** "" when the person has no name. */
  readonly name: string;
}

export interface Plan {
  readonly people: readonly SharedPerson[];
  /** Efficient (1) to fair (0), as the engine takes it. */
  readonly alpha: number;
  readonly at: string | null;
}

/** "end" is no longer written, but an older link's is still cleared from the address. */
const KEYS = ["p", "fair", "end", "at"] as const;
const DEFAULT_FAIR = 50;
const HOME_SEPARATOR = ".";
const NAME_SEPARATOR = "_";
/** The longest name the editor takes. */
export const MAX_NAME = 40;

/** A name from a link: no control characters, trimmed, and no longer than the editor allows. */
function cleanName(text: string): string {
  return [...text.replace(/\p{Cc}/gu, "").trim()].slice(0, MAX_NAME).join("").trim();
}

/** The plan's query string, keeping any other parameters already in `keep` (such as basemap=none). */
export function encodePlan(plan: Plan, keep: URLSearchParams): string {
  const params = new URLSearchParams([...keep].filter(([k]) => !(KEYS as readonly string[]).includes(k)));
  for (const p of plan.people) {
    const where = p.home === null || p.home === p.start ? p.start : `${p.start}${HOME_SEPARATOR}${p.home}`;
    params.append("p", p.name === "" ? where : `${where}${NAME_SEPARATOR}${p.name}`);
  }
  const fair = Math.round((1 - plan.alpha) * 100);
  if (fair !== DEFAULT_FAIR) params.set("fair", String(fair));
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
    const cut = value.indexOf(NAME_SEPARATOR);
    const where = cut < 0 ? value : value.slice(0, cut);
    const name = cut < 0 ? "" : cleanName(value.slice(cut + 1));
    const [start = "", home] = where.split(HOME_SEPARATOR);
    if (!known(start)) return [];
    return [{ start, home: home !== undefined && known(home) && home !== start ? home : null, name }];
  });
  const atText = params.get("at");
  const at = atText !== null && known(atText) ? atText : null;
  if (people.length === 0) return { plan: null, unknown };
  return { plan: { people, alpha: 1 - readFair(params.get("fair")) / 100, at }, unknown };
}

/**
 * The plan of the people on screen. `snapped(i)` is the station person i's location snapped to, or null
 * when it has not snapped yet; such a person is left out.
 */
export function planOf(people: readonly Person[], snapped: (index: number) => string | null, alpha: number,
  at: string | null): Plan {
  const shared = people.flatMap((p, i): SharedPerson[] => {
    if (p.start === null) return [];
    const start = "station" in p.start ? p.start.station : snapped(i);
    if (start === null) return [];
    const home = p.home !== null && "station" in p.home && p.home.station !== start ? p.home.station : null;
    return [{ start, home, name: cleanName(p.label) }];
  });
  return { people: shared, alpha, at };
}

/** The people of a shared plan; the app numbers anyone without a name. */
export function peopleOf(plan: Plan): Person[] {
  return plan.people.map((p, i) => ({
    id: `p${i + 1}`, label: p.name, start: { station: p.start }, home: p.home === null ? null : { station: p.home },
  }));
}
