/** Fetch the data files the pipeline wrote (served next to the app). */
import { MATRIX_FILES, parseData, type MatrixData } from "../../core/data";
import { RankError } from "../../core/errors";
import { parseKana, type KanaIndex } from "../model/search";
import { parseShapes, stationsChecksum, type TrackShapes } from "../model/shapes";
import { gunzip, isGzip, packedMatrixPath, packedRoutePath } from "./packed";

export interface RouteIndex {
  readonly out: Uint32Array;
  readonly home: Uint32Array;
}

export interface AppData {
  readonly matrix: MatrixData;
  readonly routeIndex: RouteIndex;
  readonly base: string;
  /** Kana readings for station search; empty when kana.json is missing. */
  readonly kana: KanaIndex;
  /** The track between neighboring stations; null when shapes.json is missing (the map draws straight lines). */
  readonly shapes: TrackShapes | null;
}

async function get(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, init);
  if (!res.ok) throw new RankError("BAD_DATA", `${url}: HTTP ${res.status}`);
  return res;
}

/** A host that refuses binary file types (a sandboxed preview) gets each file as `<name>.b64.txt`. */
const BASE64 = import.meta.env.VITE_DATA_ENCODING === "base64";

export function decodeBase64(text: string): Uint8Array {
  const bin = atob(text.trim());
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function bytes(url: string): Promise<Uint8Array> {
  if (BASE64) return decodeBase64(await (await get(`${url}.b64.txt`)).text());
  return new Uint8Array(await (await get(url)).arrayBuffer());
}

/** Browsers older than 2023 cannot unpack gzip, and a base64 host has no packed files. */
const PACKED = !BASE64 && typeof DecompressionStream !== "undefined";

/** Hosts with no packed files (a 404, or an HTML page in their place): the app stops asking them. */
const missingPacked = new Set<string>();

/**
 * A packed file, unpacked, or null. Null sends the caller to the old path for this one file. Only a host
 * that has no packed files is remembered. A server error, a dropped connection or a broken file is not,
 * so the next file is asked for packed again.
 */
async function packed(base: string, path: string): Promise<Uint8Array | null> {
  if (!PACKED || missingPacked.has(base)) return null;
  try {
    const res = await fetch(`${base}${path}`);
    if (res.status === 404) missingPacked.add(base);
    if (!res.ok) return null;
    const body = new Uint8Array(await res.arrayBuffer());
    if (!isGzip(body)) {
      missingPacked.add(base);
      return null;
    }
    return await gunzip(body);
  } catch {
    return null; // the old path loads this file
  }
}

/** A matrix file: its packed copy when the host has one, else the file itself. */
async function matrixBytes(base: string, file: string): Promise<Uint8Array> {
  return (await packed(base, packedMatrixPath(file))) ?? bytes(`${base}${file}`);
}

const wholeFiles = new Map<string, Promise<Uint8Array>>();

/** Whole route files, for base64 hosts and for hosts that ignore Range: fetched once, blocks cut from them. */
function wholeFile(url: string): Promise<Uint8Array> {
  const cached = wholeFiles.get(url) ?? bytes(url);
  wholeFiles.set(url, cached);
  cached.catch(() => wholeFiles.delete(url));
  return cached;
}

export function readU32(raw: Uint8Array): Uint32Array {
  if (raw.byteLength % 4 !== 0) throw new RankError("BAD_DATA", "route index has a partial value");
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  return Uint32Array.from({ length: raw.byteLength / 4 }, (_, i) => view.getUint32(i * 4, true));
}

export function readU16(raw: Uint8Array): Uint16Array {
  if (raw.byteLength % 2 !== 0) throw new RankError("BAD_DATA", "route block has a partial value");
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  return Uint16Array.from({ length: raw.byteLength / 2 }, (_, i) => view.getUint16(i * 2, true));
}

/** A file the app can work without: a missing or unreadable one is null. */
function optionalJson(url: string): Promise<unknown> {
  return fetch(url).then((r) => (r.ok ? (r.json() as Promise<unknown>) : null)).catch(() => null);
}

export async function loadAppData(base: string): Promise<AppData> {
  const [kanaDoc, shapesDoc, meta, stations, ...rest] = await Promise.all([
    // Optional: without it, station search still works by name.
    optionalJson(`${base}kana.json`),
    // Optional: without it, the map draws each ride station to station.
    optionalJson(`${base}shapes.json`),
    get(`${base}meta.json`).then((r) => r.json() as Promise<unknown>),
    get(`${base}stations.json`).then((r) => r.json() as Promise<unknown>),
    ...MATRIX_FILES.map((f) => matrixBytes(base, f)),
    bytes(`${base}out_routes_idx.u32`),
    bytes(`${base}home_routes_idx.u32`),
  ]);
  const matrices = rest.slice(0, MATRIX_FILES.length) as Uint8Array[];
  const [outIdx, homeIdx] = rest.slice(MATRIX_FILES.length) as [Uint8Array, Uint8Array];
  const matrix = parseData(meta, stations, Object.fromEntries(MATRIX_FILES.map((f, i) => [f, matrices[i]!])));
  const routeIndex = { out: readU32(outIdx), home: readU32(homeIdx) };
  if (routeIndex.out.length !== matrix.nCandidates + 1 || routeIndex.home.length !== matrix.nCandidates + 1) {
    throw new RankError("BAD_DATA", "route index does not match the station data");
  }
  return { matrix, routeIndex, base, kana: parseKana(kanaDoc, matrix), shapes: parseShapes(shapesDoc, matrix, stationsChecksum(meta)) };
}

function cutBlock(file: Uint8Array, start: number, end: number, candidate: number): Uint16Array {
  if (file.byteLength < end) throw new RankError("BAD_DATA", `route block ${candidate} is truncated`);
  return readU16(file.subarray(start, end));
}

/**
 * One candidate's route block. First its packed file (about 5 KB). Without one, an HTTP Range request
 * (about 20 KB instead of the whole 5 MB file). A host that ignores Range (Cloudflare Pages) sends the
 * whole file: the app keeps it, and cuts this block and every later one out of it.
 */
export async function fetchRouteBlock(data: AppData, direction: "out" | "home", candidate: number): Promise<Uint16Array> {
  const idx = direction === "out" ? data.routeIndex.out : data.routeIndex.home;
  const start = idx[candidate]! * 2;
  const end = idx[candidate + 1]! * 2;
  if (end <= start) return new Uint16Array(0);
  // A packed block of another length belongs to other data (an old cached copy): the old path loads it.
  const small = await packed(data.base, packedRoutePath(direction, candidate));
  if (small !== null && small.byteLength === end - start) return readU16(small);
  const url = `${data.base}${direction}_routes.u16`;
  const kept = wholeFiles.get(url);
  if (BASE64 || kept) return cutBlock(await (kept ?? wholeFile(url)), start, end, candidate);
  const res = await get(url, { headers: { Range: `bytes=${start}-${end - 1}` } });
  const raw = new Uint8Array(await res.arrayBuffer());
  if (res.status !== 206) {
    const block = cutBlock(raw, start, end, candidate);
    wholeFiles.set(url, Promise.resolve(raw));
    return block;
  }
  if (!(res.headers.get("Content-Range") ?? "").startsWith(`bytes ${start}-${end - 1}/`)) {
    throw new RankError("BAD_DATA", `route block ${candidate}: the server sent another byte range`);
  }
  if (raw.byteLength !== end - start) throw new RankError("BAD_DATA", `route block ${candidate} is truncated`);
  return readU16(raw);
}
