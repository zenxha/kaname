/** Decode the exact route of one journey from the M1 route blocks (for drawing it on a map). */
import { isRecord, parseCounts, readU16, type Buffers } from "./data";
import { RankError } from "./errors";

const SEATED_FLAG = 0x8000;
const WALK_FLAG = 0x4000;
const RAILWAY_MASK = 0x3fff;

export interface RouteData {
  readonly nStations: number;
  readonly nCandidates: number;
  readonly outRoutes: Uint16Array;
  readonly outIdx: Uint32Array;
  readonly homeRoutes: Uint16Array;
  readonly homeIdx: Uint32Array;
}

export interface RouteHop {
  /** Index into MatrixData.railways */
  readonly railway: number;
  readonly from: number;
  readonly to: number;
  /** The train runs through from the previous hop: no change of train. */
  readonly seated: boolean;
  /** The hop boards at another station than the previous hop ended at (a walk between them). */
  readonly walk: boolean;
}

function bad(message: string): never {
  throw new RankError("BAD_DATA", message);
}

function readU32(raw: Uint8Array | ArrayBuffer | undefined, name: string, count: number): Uint32Array {
  if (raw === undefined) bad(`missing data file ${name}`);
  const b = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
  if (b.byteLength !== count * 4) bad(`${name} has ${b.byteLength} bytes, expected ${count * 4}`);
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return Uint32Array.from({ length: count }, (_, i) => view.getUint32(i * 4, true));
}

function routeLength(meta: Record<string, unknown>, name: string): number {
  const files = isRecord(meta.files) ? meta.files : {};
  const info = files[name];
  const shape = isRecord(info) && Array.isArray(info.shape) ? info.shape : [];
  return typeof shape[0] === "number" ? shape[0] : bad(`meta.json has no shape for ${name}`);
}

/** Block starts must rise from 0 to the file length, so every block lies inside the file. */
function checkIndex(idx: Uint32Array, length: number, name: string): Uint32Array {
  if (idx[0] !== 0 || idx[idx.length - 1] !== length) bad(`${name} does not span its route file`);
  for (let i = 1; i < idx.length; i++) if (idx[i]! < idx[i - 1]!) bad(`${name} is not in order`);
  return idx;
}

export function parseRoutes(meta: unknown, buffers: Buffers): RouteData {
  const { n, k } = parseCounts(meta);
  const m = meta as Record<string, unknown>;
  const raw = (name: string) => {
    const b = buffers[name];
    return b === undefined ? bad(`missing data file ${name}`) : b instanceof Uint8Array ? b : new Uint8Array(b);
  };
  const outLen = routeLength(m, "out_routes.u16");
  const homeLen = routeLength(m, "home_routes.u16");
  return {
    nStations: n,
    nCandidates: k,
    outRoutes: readU16(raw("out_routes.u16"), outLen, "out_routes.u16"),
    outIdx: checkIndex(readU32(buffers["out_routes_idx.u32"], "out_routes_idx.u32", k + 1), outLen, "out_routes_idx.u32"),
    homeRoutes: readU16(raw("home_routes.u16"), homeLen, "home_routes.u16"),
    homeIdx: checkIndex(readU32(buffers["home_routes_idx.u32"], "home_routes_idx.u32", k + 1), homeLen, "home_routes_idx.u32"),
  };
}

/** Reads one value of a block, refusing to leave it. */
function reader(values: Uint16Array, start: number, end: number, block: number): () => number {
  let pos = start;
  return () => {
    if (pos >= end) bad(`route block ${block} is truncated`);
    return values[pos++]!;
  };
}

/**
 * The route of candidate `candidate` and station `station`:
 * "out" is station -> candidate, "home" is candidate -> station. Empty when they are the same.
 */
export function routeFor(routes: RouteData, direction: "out" | "home", candidate: number, station: number): RouteHop[] {
  const valid = (x: number, max: number) => Number.isInteger(x) && x >= 0 && x < max;
  if (!valid(candidate, routes.nCandidates) || !valid(station, routes.nStations)) {
    throw new RankError("BAD_OPTION", `no route for candidate ${candidate}, station ${station}`);
  }
  const values = direction === "out" ? routes.outRoutes : routes.homeRoutes;
  const idx = direction === "out" ? routes.outIdx : routes.homeIdx;
  return routeInBlock(values.subarray(idx[candidate]!, idx[candidate + 1]!), direction, candidate, station, routes.nStations);
}

/**
 * The same decoding on one candidate's block alone (values from idx[candidate] to idx[candidate + 1]),
 * so an app can fetch only the block it needs.
 */
export function routeInBlock(
  block: Uint16Array,
  direction: "out" | "home",
  candidate: number,
  station: number,
  nStations: number,
): RouteHop[] {
  if (!(Number.isInteger(station) && station >= 0 && station < nStations)) {
    throw new RankError("BAD_OPTION", `no route for station ${station}`);
  }
  const next = reader(block, 0, block.length, candidate);
  const stationAt = () => {
    const s = next();
    return s < nStations ? s : bad(`route block ${candidate} names station ${s}, which does not exist`);
  };
  for (let s = 0; s < station; s++) {
    const skip = next();
    for (let h = 0; h < skip; h++) {
      if (next() & WALK_FLAG) next(); // boarding station of a walk
      next(); // end station
    }
  }
  const count = next();
  const hops: RouteHop[] = [];
  let prev = direction === "out" ? station : candidate;
  for (let h = 0; h < count; h++) {
    const word = next();
    const walk = (word & WALK_FLAG) !== 0;
    const from = walk ? stationAt() : prev;
    const to = stationAt();
    hops.push({ railway: word & RAILWAY_MASK, from, to, seated: (word & SEATED_FLAG) !== 0, walk });
    prev = to;
  }
  return hops;
}
