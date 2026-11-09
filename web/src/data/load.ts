/** Fetch the data files the pipeline wrote (served next to the app). */
import { MATRIX_FILES, parseData, type MatrixData } from "../../core/data";
import { RankError } from "../../core/errors";

export interface RouteIndex {
  readonly out: Uint32Array;
  readonly home: Uint32Array;
}

export interface AppData {
  readonly matrix: MatrixData;
  readonly routeIndex: RouteIndex;
  readonly base: string;
}

async function get(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, init);
  if (!res.ok) throw new RankError("BAD_DATA", `${url}: HTTP ${res.status}`);
  return res;
}

async function bytes(url: string): Promise<Uint8Array> {
  return new Uint8Array(await (await get(url)).arrayBuffer());
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

export async function loadAppData(base: string): Promise<AppData> {
  const [meta, stations, ...rest] = await Promise.all([
    get(`${base}meta.json`).then((r) => r.json() as Promise<unknown>),
    get(`${base}stations.json`).then((r) => r.json() as Promise<unknown>),
    ...MATRIX_FILES.map((f) => bytes(`${base}${f}`)),
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
  return { matrix, routeIndex, base };
}

/**
 * One candidate's route block, fetched with an HTTP Range request (about 20 KB instead of the
 * whole 5 MB file). A server that ignores Range sends the whole file; then the block is cut out.
 */
export async function fetchRouteBlock(data: AppData, direction: "out" | "home", candidate: number): Promise<Uint16Array> {
  const idx = direction === "out" ? data.routeIndex.out : data.routeIndex.home;
  const start = idx[candidate]! * 2;
  const end = idx[candidate + 1]! * 2;
  if (end <= start) return new Uint16Array(0);
  const res = await get(`${data.base}${direction}_routes.u16`, { headers: { Range: `bytes=${start}-${end - 1}` } });
  const raw = new Uint8Array(await res.arrayBuffer());
  if (res.status === 206 && !(res.headers.get("Content-Range") ?? "").startsWith(`bytes ${start}-${end - 1}/`)) {
    throw new RankError("BAD_DATA", `route block ${candidate}: the server sent another byte range`);
  }
  const block = res.status === 206 ? raw : raw.subarray(start, end);
  if (block.byteLength !== end - start) throw new RankError("BAD_DATA", `route block ${candidate} is truncated`);
  return readU16(block);
}
