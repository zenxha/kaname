/** Parse and validate the M1 data files (meta.json, stations.json and the binary matrices). */
import { RankError } from "./errors";

export const FORMAT_VERSION = 1;
export const UNREACHABLE = 0xffff;
/** last_dep value when the home station is the candidate itself. */
export const SAME_STATION = 0xfffe;
export const NO_TRANSFERS = 0xff;
export const MATRIX_FILES = ["out_min.u16", "out_xfer.u8", "home_min.u16", "home_xfer.u8", "last_dep.u16"] as const;

/** [railway index, lng, lat] of one platform group. */
export type StopRecord = readonly [number, number, number];

export interface StationRecord {
  readonly index: number;
  readonly id: string;
  readonly ja: string;
  readonly en: string;
  readonly aliases: readonly string[];
  readonly lat: number;
  readonly lng: number;
  readonly lines: number;
  readonly candidate: boolean;
  readonly railways: readonly number[];
  readonly stops: readonly StopRecord[];
}

export interface RailwayRecord {
  readonly id: string;
  readonly ja: string;
  readonly en: string;
  readonly color: string;
}

export interface MatrixData {
  readonly stations: readonly StationRecord[];
  readonly railways: readonly RailwayRecord[];
  readonly nStations: number;
  readonly nCandidates: number;
  /** [station * nCandidates + candidate] */
  readonly outMin: Uint16Array;
  readonly outXfer: Uint8Array;
  /** [candidate * nStations + station] */
  readonly homeMin: Uint16Array;
  readonly homeXfer: Uint8Array;
  readonly lastDep: Uint16Array;
  readonly byId: ReadonlyMap<string, number>;
  /** normalized name or alias -> station indexes */
  readonly byName: ReadonlyMap<string, readonly number[]>;
}

export type Buffers = Readonly<Record<string, ArrayBuffer | Uint8Array>>;

function bad(message: string): never {
  throw new RankError("BAD_DATA", message);
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown, where: string): string {
  return typeof v === "string" && v.length > 0 ? v : bad(`${where} must be a non-empty string`);
}

function num(v: unknown, where: string): number {
  return typeof v === "number" && Number.isFinite(v) ? v : bad(`${where} must be a finite number`);
}

function int(v: unknown, where: string): number {
  return Number.isInteger(v) && (v as number) >= 0 ? (v as number) : bad(`${where} must be a whole number`);
}

function list(v: unknown, where: string): readonly unknown[] {
  return Array.isArray(v) ? v : bad(`${where} must be a list`);
}

/** NFKC, lower case, single spaces, and ヶ/ケ treated alike, so "市ヶ谷", "市ケ谷" and "ICHIGAYA" match. */
export function normalizeName(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim().replace(/ヶ/g, "ケ").replace(/ヵ/g, "カ");
}

function parseStop(v: unknown, where: string): StopRecord {
  const a = list(v, where);
  if (a.length !== 3) bad(`${where} must be [railway, lng, lat]`);
  return [int(a[0], where), num(a[1], where), num(a[2], where)];
}

function parseStation(v: unknown, i: number, nCandidates: number): StationRecord {
  const where = `station ${i}`;
  if (!isRecord(v)) bad(`${where} must be an object`);
  if (v.i !== i) bad(`${where} has index ${String(v.i)}`);
  const candidate = v.candidate === true;
  if (candidate !== i < nCandidates) bad(`${where}: candidates must come first`);
  return {
    index: i,
    id: str(v.id, `${where} id`),
    ja: str(v.ja, `${where} ja`),
    en: str(v.en, `${where} en`),
    aliases: list(v.aliases, `${where} aliases`).map((a) => str(a, `${where} alias`)),
    lat: num(v.lat, `${where} lat`),
    lng: num(v.lng, `${where} lng`),
    lines: int(v.lines, `${where} lines`),
    candidate,
    railways: list(v.railways, `${where} railways`).map((r) => int(r, `${where} railway`)),
    stops: list(v.stops, `${where} stops`).map((s) => parseStop(s, `${where} stop`)),
  };
}

function parseRailway(v: unknown, i: number): RailwayRecord {
  const where = `railway ${i}`;
  if (!isRecord(v)) bad(`${where} must be an object`);
  return { id: str(v.id, `${where} id`), ja: str(v.ja, `${where} ja`), en: str(v.en, `${where} en`),
    color: typeof v.color === "string" ? v.color : "#888888" };
}

function bytes(buffers: Buffers, name: string): Uint8Array {
  const b = buffers[name];
  if (b === undefined) bad(`missing data file ${name}`);
  return b instanceof Uint8Array ? b : new Uint8Array(b);
}

/** Copy little-endian uint16 values out of raw bytes (works on any platform byte order). */
export function readU16(raw: Uint8Array, count: number, name: string): Uint16Array {
  if (raw.byteLength !== count * 2) bad(`${name} has ${raw.byteLength} bytes, expected ${count * 2}`);
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const out = new Uint16Array(count);
  for (let i = 0; i < count; i++) out[i] = view.getUint16(i * 2, true);
  return out;
}

function readU8(raw: Uint8Array, count: number, name: string): Uint8Array {
  if (raw.byteLength !== count) bad(`${name} has ${raw.byteLength} bytes, expected ${count}`);
  return raw.slice();
}

function indexNames(stations: readonly StationRecord[]): Map<string, readonly number[]> {
  const byName = new Map<string, number[]>();
  for (const s of stations) {
    for (const name of new Set([s.ja, s.en, ...s.aliases].map(normalizeName))) {
      byName.set(name, [...(byName.get(name) ?? []), s.index]);
    }
  }
  return byName;
}

export function parseCounts(meta: unknown): { n: number; k: number } {
  if (!isRecord(meta)) bad("meta.json must be an object");
  if (meta.format !== FORMAT_VERSION) bad(`meta.json format ${String(meta.format)} is not ${FORMAT_VERSION}`);
  if (!isRecord(meta.counts)) bad("meta.json counts missing");
  return { n: int(meta.counts.stations, "meta stations"), k: int(meta.counts.candidates, "meta candidates") };
}

export function parseData(meta: unknown, stationsDoc: unknown, buffers: Buffers): MatrixData {
  const { n, k } = parseCounts(meta);
  if (!isRecord(stationsDoc)) bad("stations.json must be an object");
  if (stationsDoc.n_stations !== n || stationsDoc.n_candidates !== k) bad("stations.json counts disagree with meta.json");
  const rawStations = list(stationsDoc.stations, "stations.json stations");
  if (rawStations.length !== n || k > n || k < 1) bad("stations.json has the wrong number of stations");
  const stations = rawStations.map((s, i) => parseStation(s, i, k));
  const byId = new Map(stations.map((s) => [s.id, s.index]));
  if (byId.size !== n) bad("stations.json has duplicate station ids");
  return {
    stations,
    railways: list(stationsDoc.railways, "stations.json railways").map(parseRailway),
    nStations: n,
    nCandidates: k,
    outMin: readU16(bytes(buffers, "out_min.u16"), n * k, "out_min.u16"),
    outXfer: readU8(bytes(buffers, "out_xfer.u8"), n * k, "out_xfer.u8"),
    homeMin: readU16(bytes(buffers, "home_min.u16"), k * n, "home_min.u16"),
    homeXfer: readU8(bytes(buffers, "home_xfer.u8"), k * n, "home_xfer.u8"),
    lastDep: readU16(bytes(buffers, "last_dep.u16"), k * n, "last_dep.u16"),
    byId,
    byName: indexNames(stations),
  };
}
