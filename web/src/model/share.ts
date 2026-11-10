/**
 * The shareable link: the whole plan in one query parameter, as stations, names and settings.
 * A location never travels: it goes as the station it snapped to.
 *
 *   ?p=seiseki-sakuragaoka_Shizuku~kanazawa-hakkei.yokohama_Hitori~fair.75~at.tokyo
 *
 * One parameter, because Instagram's direct messages keep only the first parameter of a link.
 * "~" separates the items. A person: the start station, ".home" when home is another station, and
 * "_name" when the person has a name. Station ids are a-z, 0-9 and "-", so everything after the first
 * "_" is the name. A name keeps only ASCII letters, digits, "_" and "-" as they are, and everything
 * else is percent-encoded. So a "~" or "&" in a name never splits the link, and a link never ends in
 * punctuation that a chat app leaves out of it.
 * fair.N: the slider, 0 (efficient) to 100 (fair); 50 is left out. at.ID: a station picked from the ranking.
 * Older links, with one "p" for each person and separate "fair" and "at" parameters, still open.
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

/** The parameters a plan writes, and those of older links, which a new link clears from the address. */
const KEYS = ["p", "fair", "end", "at"] as const;
const DEFAULT_FAIR = 50;
const ITEM_SEPARATOR = "~";
const HOME_SEPARATOR = ".";
const NAME_SEPARATOR = "_";
/** A setting item, "fair.75" or "at.tokyo". No station id is "fair" or "at". */
const SETTING = /^(fair|at)\.(.*)$/s;
/** The characters that encodeURIComponent leaves as they are, but a link must not: "~" splits it, and chat apps cut a link at final punctuation. */
const UNSAFE = /[!'()*.~]/g;
/** The longest name the editor takes. */
export const MAX_NAME = 40;

/** A name from a link: no control characters or broken surrogates, trimmed, and no longer than the editor allows. */
function cleanName(text: string): string {
  return [...text.replace(/[\p{Cc}\p{Cs}]/gu, "").trim()].slice(0, MAX_NAME).join("").trim();
}

/** Text for a link item: ASCII letters, digits, "_" and "-" stay, a space is "+", and the rest is percent-encoded. */
function encodePart(text: string): string {
  return encodeURIComponent(text)
    .replace(UNSAFE, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
    .replaceAll("%20", "+");
}

/** Decodes like a browser reads a query: "+" is a space, and a broken percent sign stays as it is. */
function decodePart(text: string): string {
  const spaced = text.replaceAll("+", " ");
  try {
    return decodeURIComponent(spaced);
  } catch {
    return spaced;
  }
}

function personItem(p: SharedPerson): string {
  const where = p.home === null || p.home === p.start
    ? encodePart(p.start)
    : `${encodePart(p.start)}${HOME_SEPARATOR}${encodePart(p.home)}`;
  return p.name === "" ? where : `${where}${NAME_SEPARATOR}${encodePart(p.name)}`;
}

/** The plan's query string, then any other parameters already in `keep` (such as basemap=none). The plan comes first. */
export function encodePlan(plan: Plan, keep: URLSearchParams): string {
  const rest = new URLSearchParams([...keep].filter(([k]) => !(KEYS as readonly string[]).includes(k))).toString();
  const fair = Math.round((1 - plan.alpha) * 100);
  const items = plan.people.length === 0 ? [] : [
    ...plan.people.map(personItem),
    ...(fair === DEFAULT_FAIR ? [] : [`fair.${fair}`]),
    ...(plan.at === null ? [] : [`at.${encodePart(plan.at)}`]),
  ];
  const parts = [...(items.length === 0 ? [] : [`p=${items.join(ITEM_SEPARATOR)}`]), ...(rest === "" ? [] : [rest])];
  return parts.length === 0 ? "" : `?${parts.join("&")}`;
}

/**
 * Every item of every "p" in a query, decoded. The split comes before the decoding, so an encoded "~"
 * stays inside its name. An older link has one "p" for each person, and its names never hold a plain "~".
 */
function planItems(search: string): string[] {
  const query = search.startsWith("?") ? search.slice(1) : search;
  return query.split("&").flatMap((pair) => {
    const eq = pair.indexOf("=");
    if (eq < 0 || decodePart(pair.slice(0, eq)) !== "p") return [];
    return pair.slice(eq + 1).split(ITEM_SEPARATOR).filter((item) => item !== "").map(decodePart);
  });
}

/** The last value of a setting item, else the older link's separate parameter. */
function setting(items: readonly string[], params: URLSearchParams, key: "fair" | "at"): string | null {
  const found = items.map((item) => SETTING.exec(item)).filter((m) => m?.[1] === key).at(-1);
  return found?.[2] ?? params.get(key);
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
  const items = planItems(search);
  let unknown = 0;
  const known = (id: string): boolean => {
    const ok = isStation(id);
    if (!ok) unknown += 1;
    return ok;
  };
  const people = items.filter((item) => !SETTING.test(item)).slice(0, MAX_PARTICIPANTS).flatMap((value): SharedPerson[] => {
    const cut = value.indexOf(NAME_SEPARATOR);
    const where = cut < 0 ? value : value.slice(0, cut);
    const name = cut < 0 ? "" : cleanName(value.slice(cut + 1));
    const [start = "", home] = where.split(HOME_SEPARATOR);
    if (!known(start)) return [];
    return [{ start, home: home !== undefined && known(home) && home !== start ? home : null, name }];
  });
  const atText = setting(items, params, "at");
  const at = atText !== null && known(atText) ? atText : null;
  if (people.length === 0) return { plan: null, unknown };
  return { plan: { people, alpha: 1 - readFair(setting(items, params, "fair")) / 100, at }, unknown };
}

/**
 * The plan of the people on screen. `snapped(i, which)` is the station person i's start or home point
 * (a location or an address) snapped to, or null when it has not snapped yet. A start that has not
 * snapped leaves the person out; a home that has not snapped becomes the start.
 */
export function planOf(people: readonly Person[], snapped: (index: number, which: "start" | "home") => string | null,
  alpha: number, at: string | null): Plan {
  const shared = people.flatMap((p, i): SharedPerson[] => {
    if (p.start === null) return [];
    const start = "station" in p.start ? p.start.station : snapped(i, "start");
    if (start === null) return [];
    const homeStation = p.home === null ? null : "station" in p.home ? p.home.station : snapped(i, "home");
    const home = homeStation !== null && homeStation !== start ? homeStation : null;
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
