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
    outIdx: readU32(buffers["out_routes_idx.u32"], "out_routes_idx.u32", k + 1),
    homeRoutes: readU16(raw("home_routes.u16"), homeLen, "home_routes.u16"),
    homeIdx: readU32(buffers["home_routes_idx.u32"], "home_routes_idx.u32", k + 1),
  };
}

/** Position just after the route that starts at `pos`. */
function skipRoute(values: Uint16Array, pos: number): number {
  const count = values[pos]!;
  let p = pos + 1;
  for (let h = 0; h < count; h++) p += values[p]! & WALK_FLAG ? 3 : 2;
  return p;
}

/**
 * The route of candidate `candidate` and station `station`:
 * "out" is station -> candidate, "home" is candidate -> station. Empty when they are the same.
 */
export function routeFor(routes: RouteData, direction: "out" | "home", candidate: number, station: number): RouteHop[] {
  if (!(candidate >= 0 && candidate < routes.nCandidates && station >= 0 && station < routes.nStations)) {
    throw new RankError("BAD_OPTION", `no route for candidate ${candidate}, station ${station}`);
  }
  const values = direction === "out" ? routes.outRoutes : routes.homeRoutes;
  const idx = direction === "out" ? routes.outIdx : routes.homeIdx;
  let pos = idx[candidate]!;
  for (let s = 0; s < station; s++) pos = skipRoute(values, pos);
  if (pos >= idx[candidate + 1]!) bad(`route block ${candidate} is shorter than expected`);
  const count = values[pos++]!;
  const hops: RouteHop[] = [];
  let prev = direction === "out" ? station : candidate;
  for (let h = 0; h < count; h++) {
    const word = values[pos++]!;
    const walk = (word & WALK_FLAG) !== 0;
    const from = walk ? values[pos++]! : prev;
    const to = values[pos++]!;
    hops.push({ railway: word & RAILWAY_MASK, from, to, seated: (word & SEATED_FLAG) !== 0, walk });
    prev = to;
  }
  return hops;
}
