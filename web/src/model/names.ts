import type { MatrixData, StationRecord } from "../../core/data";
import type { Lang } from "./i18n";
import type { Place } from "./scenario";

export function stationById(data: MatrixData, id: string): StationRecord | undefined {
  const i = data.byId.get(id);
  return i === undefined ? undefined : data.stations[i];
}

export function stationName(s: StationRecord | undefined, lang: Lang): string {
  if (s === undefined) return "?";
  return lang === "ja" ? s.ja : s.en;
}

export function placeName(data: MatrixData, place: Place | null, lang: Lang, here: string): string {
  if (place === null) return "";
  if ("station" in place) return stationName(stationById(data, place.station), lang);
  return here;
}

export function railwayName(data: MatrixData, index: number, lang: Lang): string {
  const r = data.railways[index];
  if (r === undefined) return "";
  return lang === "ja" ? r.ja : r.en.replace(/ Line$/, "");
}
