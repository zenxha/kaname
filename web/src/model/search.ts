/** Station autocomplete over Japanese and English names and aliases. */
import type { MatrixData, StationRecord } from "../../core/data";

/** Lower case, no diacritics (ō -> o), no spaces or hyphens, ヶ = ケ. */
export function fold(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\-‐・·.]/g, "")
    .replace(/ヶ/g, "ケ");
}

const indexCache = new WeakMap<MatrixData, readonly (readonly string[])[]>();

function names(data: MatrixData): readonly (readonly string[])[] {
  const cached = indexCache.get(data);
  if (cached) return cached;
  const built = data.stations.map((s) => [...new Set([s.ja, s.en, s.id, ...s.aliases].map(fold))]);
  indexCache.set(data, built);
  return built;
}

/** 0 exact, 1 prefix, 2 substring, -1 no match. */
function matchLevel(keys: readonly string[], q: string): number {
  if (keys.includes(q)) return 0;
  if (keys.some((k) => k.startsWith(q))) return 1;
  return keys.some((k) => k.includes(q)) ? 2 : -1;
}

export function searchStations(data: MatrixData, query: string, limit = 8): StationRecord[] {
  const q = fold(query);
  if (q.length === 0) return [];
  const index = names(data);
  return data.stations
    .map((s) => ({ s, level: matchLevel(index[s.index]!, q) }))
    .filter((x) => x.level >= 0)
    .sort((x, y) => x.level - y.level || y.s.lines - x.s.lines || Number(y.s.candidate) - Number(x.s.candidate)
      || x.s.ja.length - y.s.ja.length || (x.s.id < y.s.id ? -1 : 1))
    .slice(0, limit)
    .map((x) => x.s);
}
