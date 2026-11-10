/**
 * Track shapes from data/shapes.json (MLIT 国土数値情報 N02): the track between each pair of neighboring
 * stations on a railway. The file is optional. Without it, or with a file built for other station data,
 * the map draws each ride station to station in straight lines.
 */
import { isRecord, type MatrixData, type RailwayRecord } from "../../core/data";
import type { LngLat } from "./geometry";

/**
 * Per railway, per pair of neighboring stations in running order: the track points, or null for a straight
 * line. A loop line has one more pair, from its last station back to its first.
 */
export type TrackShapes = readonly (readonly (readonly LngLat[] | null)[])[];

const FORMAT = 1;
/** Decimals in the encoded polylines (the published encoding uses 5). */
const PRECISION = 5;
const SCALE = 10 ** PRECISION;

/** The number of pairs the pipeline writes for a railway. */
export function pairCount(r: RailwayRecord): number {
  const n = r.stations.length;
  return Math.max(n - 1, 0) + (r.loop && n > 2 ? 1 : 0);
}

/** The published polyline encoding (latitude first) as [lng, lat] points, or null when the text is broken. */
function decode(text: string): LngLat[] | null {
  const values: number[] = [];
  let acc = 0;
  let shift = 0;
  for (let i = 0; i < text.length; i++) {
    const chunk = text.charCodeAt(i) - 63;
    if (chunk < 0 || chunk > 63) return null;
    acc += (chunk & 0x1f) * 2 ** shift;
    shift += 5;
    if (chunk < 0x20) {
      const half = Math.floor(acc / 2);
      values.push(acc % 2 === 1 ? -half - 1 : half);
      acc = 0;
      shift = 0;
    }
  }
  if (shift !== 0 || values.length % 2 !== 0) return null;
  const points: LngLat[] = [];
  let x = 0;
  let y = 0;
  for (let k = 0; k < values.length; k += 2) {
    y += values[k]!;
    x += values[k + 1]!;
    points.push([x / SCALE, y / SCALE]);
  }
  return points;
}

export function decodePolyline(text: string): LngLat[] {
  const points = decode(text);
  if (points === null) throw new Error("the polyline is broken");
  return points;
}

/** One entry: "" is a straight line (null), and undefined marks an entry that is not a valid polyline. */
function parseEntry(entry: unknown): LngLat[] | null | undefined {
  if (typeof entry !== "string") return undefined;
  return entry === "" ? null : (decode(entry) ?? undefined);
}

/** The checksum of stations.json that meta.json records, or null. */
export function stationsChecksum(meta: unknown): string | null {
  const files = isRecord(meta) ? meta.files : null;
  const entry = isRecord(files) ? files["stations.json"] : null;
  return isRecord(entry) && typeof entry.sha256 === "string" ? entry.sha256 : null;
}

/**
 * Reads data/shapes.json. The file names the stations.json it was built from, and `stationsSha256` is the
 * checksum of the loaded one (from meta.json). A file for other station data, or any count that does not
 * fit, means the map draws straight lines.
 */
export function parseShapes(doc: unknown, data: MatrixData, stationsSha256: string | null): TrackShapes | null {
  if (!isRecord(doc) || doc.format !== FORMAT || doc.precision !== PRECISION) return null;
  if (stationsSha256 === null || doc.stations_sha256 !== stationsSha256) return null;
  const railways = doc.railways;
  if (!Array.isArray(railways) || railways.length !== data.railways.length) return null;
  const parsed = railways.map((entries: unknown, i) => {
    if (!Array.isArray(entries) || entries.length !== pairCount(data.railways[i]!)) return undefined;
    const lines = entries.map(parseEntry);
    return lines.some((l) => l === undefined) ? undefined : (lines as (LngLat[] | null)[]);
  });
  return parsed.some((r) => r === undefined) ? null : (parsed as TrackShapes);
}
