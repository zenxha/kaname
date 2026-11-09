/** Find stations by name and snap coordinates to nearby stations. */
import { normalizeName, type MatrixData, type StationRecord } from "./data";
import { RankError } from "./errors";
import type { StationInfo } from "./types";

export const WALK_M_PER_MIN = 80;
export const WALK_DETOUR = 1.3;
export const SNAP_COUNT = 3;
/** A point farther than this from every station is outside the train network (buses are out of scope). */
export const MAX_SNAP_M = 2000;

export interface StationOption {
  readonly index: number;
  readonly distanceM: number;
  readonly walkMinutes: number;
}

export function stationInfo(s: StationRecord): StationInfo {
  return { id: s.id, ja: s.ja, en: s.en, lines: s.lines };
}

export function describeStation(s: StationRecord): string {
  return s.ja === s.en ? s.ja : `${s.en} (${s.ja})`;
}

/** Station index from an id, a Japanese or English name, or an alias. */
export function findStation(data: MatrixData, query: string): number {
  const exact = data.byId.get(query.trim());
  if (exact !== undefined) return exact;
  const hits = data.byName.get(normalizeName(query)) ?? [];
  if (hits.length === 1) return hits[0]!;
  if (hits.length > 1) {
    const ids = hits.map((i) => `${data.stations[i]!.id} (${data.stations[i]!.ja})`).join(", ");
    throw new RankError("AMBIGUOUS_STATION", `"${query}" matches ${hits.length} stations: ${ids}. Use the id`);
  }
  throw new RankError(
    "UNKNOWN_STATION",
    `"${query.trim()}" is not in the travel-time data. It covers stations within about 60 km of Tokyo Station`,
  );
}

/** Walking minutes for a straight-line distance: 80 m/min with a 1.3 detour factor, rounded up. */
export function walkMinutes(distanceM: number): number {
  return Math.max(0, Math.ceil((distanceM * WALK_DETOUR) / WALK_M_PER_MIN - 1e-9));
}

function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dx = (lng2 - lng1) * Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180) * 111_320;
  const dy = (lat2 - lat1) * 110_540;
  return Math.hypot(dx, dy);
}

/** Nearest platform of a station (or its centre when it lists no platforms). */
function stationDistance(s: StationRecord, lat: number, lng: number): number {
  if (s.stops.length === 0) return distanceM(lat, lng, s.lat, s.lng);
  return Math.min(...s.stops.map(([, sLng, sLat]) => distanceM(lat, lng, sLat, sLng)));
}

/** The SNAP_COUNT nearest stations to a coordinate, nearest first. */
export function snapToStations(data: MatrixData, lat: number, lng: number): StationOption[] {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new RankError("BAD_PARTICIPANT", `${String(lat)}, ${String(lng)} is not a valid latitude, longitude`);
  }
  const nearest = data.stations
    .map((s) => ({ index: s.index, distanceM: stationDistance(s, lat, lng) }))
    .sort((a, b) => a.distanceM - b.distanceM || a.index - b.index)
    .slice(0, SNAP_COUNT);
  const first = nearest[0];
  if (first === undefined || first.distanceM > MAX_SNAP_M) {
    const km = first === undefined ? "?" : (first.distanceM / 1000).toFixed(1);
    throw new RankError("LOCATION_TOO_FAR", `${lat}, ${lng} is ${km} km from the nearest station in the data`);
  }
  return nearest.filter((o) => o.distanceM <= MAX_SNAP_M).map((o) => {
    const rounded = Math.round(o.distanceM);
    return { index: o.index, distanceM: rounded, walkMinutes: walkMinutes(rounded) };
  });
}
