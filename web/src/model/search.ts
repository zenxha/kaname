/** Station autocomplete over Japanese and English names, aliases and kana readings. */
import type { MatrixData, StationRecord } from "../../core/data";

/** Kana readings by station index (data/kana.json). */
export type KanaIndex = ReadonlyMap<number, readonly string[]>;

const NO_KANA: KanaIndex = new Map();

/** Lower case, no diacritics (ō -> o), no spaces or hyphens, ヶ = ケ, katakana as hiragana. */
export function fold(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\-‐・·.]/g, "")
    .replace(/ヶ/g, "ケ")
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

/** Reads data/kana.json; a missing or malformed file only means no kana search. */
export function parseKana(doc: unknown, data: MatrixData): KanaIndex {
  const kana = (doc as { readonly kana?: unknown } | null)?.kana;
  if (kana === null || typeof kana !== "object" || Array.isArray(kana)) return NO_KANA;
  return new Map(Object.entries(kana).flatMap(([id, readings]): [number, string[]][] => {
    const i = data.byId.get(id);
    const ok = Array.isArray(readings) && readings.length > 0 && readings.every((r) => typeof r === "string");
    return i === undefined || !ok ? [] : [[i, readings as string[]]];
  }));
}

const indexCache = new WeakMap<object, readonly (readonly string[])[]>();

function names(data: MatrixData, kana: KanaIndex): readonly (readonly string[])[] {
  const key = kana === NO_KANA ? data : kana;
  const cached = indexCache.get(key);
  if (cached) return cached;
  const built = data.stations.map((s) => [...new Set([s.ja, s.en, s.id, ...s.aliases, ...(kana.get(s.index) ?? [])].map(fold))]);
  indexCache.set(key, built);
  return built;
}

/** 0 exact, 1 prefix, 2 substring, -1 no match. */
function matchLevel(keys: readonly string[], q: string): number {
  if (keys.includes(q)) return 0;
  if (keys.some((k) => k.startsWith(q))) return 1;
  return keys.some((k) => k.includes(q)) ? 2 : -1;
}

export function searchStations(data: MatrixData, query: string, limit = 8, kana: KanaIndex = NO_KANA): StationRecord[] {
  const q = fold(query);
  if (q.length === 0) return [];
  const index = names(data, kana);
  return data.stations
    .map((s) => ({ s, level: matchLevel(index[s.index]!, q) }))
    .filter((x) => x.level >= 0)
    .sort((x, y) => x.level - y.level || y.s.lines - x.s.lines || Number(y.s.candidate) - Number(x.s.candidate)
      || x.s.ja.length - y.s.ja.length || (x.s.id < y.s.id ? -1 : 1))
    .slice(0, limit)
    .map((x) => x.s);
}
