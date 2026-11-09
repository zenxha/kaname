/**
 * Address search on the device, over MLIT's town and 丁目 points (data/addresses.json). An address
 * resolves to its 丁目: close enough to find the nearest stations, and nothing typed leaves the phone.
 */
import { RankError } from "../../core/errors";
import type { LngLat } from "./geometry";

export interface Town {
  /** Prefecture and city, for example 東京都渋谷区. */
  readonly city: string;
  /** Town or 丁目, for example 神南一丁目. */
  readonly name: string;
  readonly at: LngLat;
  /** The search key of city + name. */
  readonly key: string;
  /** Where the town part starts in the key. */
  readonly townAt: number;
}

export interface AddressIndex {
  readonly towns: readonly Town[];
}

const KANJI_DIGITS: Readonly<Record<string, number>> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const COORD_SCALE = 1e5;

/** 一 to 九十九 as a number. */
function kanjiNumber(text: string): number {
  const [tens, ones = ""] = text.includes("十") ? text.split("十") : ["", text];
  const t = text.includes("十") ? (tens === "" ? 1 : KANJI_DIGITS[tens!] ?? 0) : 0;
  return t * 10 + (ones === "" ? 0 : KANJI_DIGITS[ones] ?? 0);
}

/** A kanji number from 一 to 九十九 just before 丁目, and not part of a longer run of numerals. */
const KANJI_CHOME = /(?<![一二三四五六七八九十])([一二三四五六七八九]?十[一二三四五六七八九]?|[一二三四五六七八九])丁目/g;
/** Typed text longer than this is cut: no address is that long, and it keeps every search quick. */
export const MAX_QUERY = 100;

/**
 * NFKC, no spaces, ヶ = ケ = が (place names are written all three ways), and 丁目 numbers in digits:
 * 神南一丁目 and 神南１丁目 both become 神南1丁目.
 */
export function addressKey(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/[ヶが]/g, "ケ")
    .replace(KANJI_CHOME, (_, n: string) => `${kanjiNumber(n)}丁目`);
}

/**
 * The keys to try for a typed address: first cut to its 丁目 (神南1-2-3 and 神南1丁目5番 give 神南1丁目),
 * then, for a town without 丁目, the town alone (小野路町1234 gives 小野路町).
 */
function queryKeys(text: string): string[] {
  const key = addressKey(text.slice(0, MAX_QUERY));
  const cut = key.indexOf("丁目");
  const digits = cut < 0 ? null : /\d+$/.exec(key.slice(0, cut));
  if (digits) return [key.slice(0, cut + 2)];
  const block = /^(.*?\D)(\d+)/.exec(key);
  return block ? [`${block[1]}${block[2]}丁目`, block[1]!] : [key];
}

const CJK = /[぀-ヿ㐀-鿿]/;

/** Worth an address search: at least two characters, and some Japanese in them. */
export function looksLikeAddress(text: string): boolean {
  const t = text.trim();
  return t.length >= 2 && CJK.test(t);
}

/**
 * 0: the query starts the town, and its city has the name too (渋谷 finds 渋谷区渋谷 first).
 * 1: the query starts the town. 2: it runs from the city into the town. 3: anywhere else. -1: no match.
 */
function rank(town: Town, q: string): number {
  if (town.key.startsWith(q, town.townAt)) return town.key.slice(0, town.townAt).includes(q) ? 0 : 1;
  const at = town.key.indexOf(q);
  if (at < 0) return -1;
  return at < town.townAt && at + q.length > town.townAt ? 2 : 3;
}

function search(index: AddressIndex, q: string, limit: number): Town[] {
  const hits: { readonly town: Town; readonly rank: number }[] = [];
  for (const town of index.towns) {
    const r = rank(town, q);
    if (r >= 0) hits.push({ town, rank: r });
  }
  return hits
    .sort((a, b) => a.rank - b.rank || a.town.key.length - b.town.key.length || (a.town.key < b.town.key ? -1 : 1))
    .slice(0, limit)
    .map((h) => h.town);
}

export function searchAddresses(index: AddressIndex, text: string, limit = 4): Town[] {
  if (!looksLikeAddress(text.slice(0, MAX_QUERY))) return [];
  for (const q of queryKeys(text)) {
    const found = search(index, q, limit);
    if (found.length > 0) return found;
  }
  return [];
}

function bad(message: string): never {
  throw new RankError("BAD_DATA", `address index: ${message}`);
}

/** Reads data/addresses.json: { cities: [[city, [[town, lng*1e5, lat*1e5], ...]], ...] }. */
export function parseAddresses(doc: unknown): AddressIndex {
  const cities = (doc as { readonly cities?: unknown } | null)?.cities;
  if (!Array.isArray(cities)) bad("no cities");
  const towns = cities.flatMap((entry: unknown): Town[] => {
    if (!Array.isArray(entry) || typeof entry[0] !== "string" || !Array.isArray(entry[1])) bad("a malformed city");
    const city = entry[0] as string;
    const cityKey = addressKey(city);
    return (entry[1] as unknown[]).map((t): Town => {
      if (!Array.isArray(t) || typeof t[0] !== "string" || typeof t[1] !== "number" || typeof t[2] !== "number") bad(`a malformed town in ${city}`);
      const name = t[0] as string;
      return { city, name, at: [(t[1] as number) / COORD_SCALE, (t[2] as number) / COORD_SCALE], key: cityKey + addressKey(name), townAt: cityKey.length };
    });
  });
  return { towns };
}
