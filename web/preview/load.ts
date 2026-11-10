/**
 * The data a link preview needs, read on the server from the site's own files: the station data, the
 * packed matrices and track shapes, and one meeting station's packed route block. A deploy always has
 * the packed files, so there is no fallback to the large files.
 */
import { isRecord, MATRIX_FILES, parseData, readU16, type MatrixData } from "../core/data";
import { RankError } from "../core/errors";
import { gunzip, isGzip, packedMatrixPath, packedRoutePath } from "../src/data/packed";
import { parseShapes, stationsChecksum, type TrackShapes } from "../src/model/shapes";

/** Fetches one of the site's files by its path, such as "/meta.json". */
export type AssetFetch = (path: string) => Promise<Response>;

export interface PreviewData {
  readonly matrix: MatrixData;
  readonly shapes: TrackShapes | null;
  /** Changes with any data file, from the checksums in meta.json. */
  readonly version: string;
}

/** A short hash (FNV-1a, 32 bits) of every data file's checksum in meta.json, in name order. */
export function dataVersion(meta: unknown): string {
  const files = isRecord(meta) && isRecord(meta.files) ? meta.files : {};
  const text = Object.keys(files).sort().map((name) => {
    const entry = files[name];
    return `${name}:${isRecord(entry) && typeof entry.sha256 === "string" ? entry.sha256 : ""}`;
  }).join("\n");
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return hash.toString(16).padStart(8, "0");
}

async function file(assets: AssetFetch, path: string): Promise<Response> {
  const res = await assets(`/${path}`);
  if (!res.ok) throw new RankError("BAD_DATA", `${path}: HTTP ${res.status}`);
  return res;
}

/** A packed file's bytes. A host that unpacks gzip on the way sends them already unpacked. */
async function unpacked(assets: AssetFetch, path: string): Promise<Uint8Array> {
  const body = new Uint8Array(await (await file(assets, path)).arrayBuffer());
  return isGzip(body) ? gunzip(body) : body;
}

export async function loadPreviewData(assets: AssetFetch): Promise<PreviewData> {
  const [meta, stations, shapesDoc, ...matrices] = await Promise.all([
    file(assets, "meta.json").then((r) => r.json() as Promise<unknown>),
    file(assets, "stations.json").then((r) => r.json() as Promise<unknown>),
    // Optional: without it, the picture draws each ride station to station.
    assets("/shapes.json").then((r) => (r.ok ? (r.json() as Promise<unknown>) : null)).catch(() => null),
    ...MATRIX_FILES.map((f) => unpacked(assets, packedMatrixPath(f))),
  ]);
  const matrix = parseData(meta, stations, Object.fromEntries(MATRIX_FILES.map((f, i) => [f, matrices[i]!])));
  return { matrix, shapes: parseShapes(shapesDoc, matrix, stationsChecksum(meta)), version: dataVersion(meta) };
}

/** One meeting station's outbound route block, from its packed file (about 5 KB). */
export async function routeBlock(assets: AssetFetch, candidate: number): Promise<Uint16Array> {
  const raw = await unpacked(assets, packedRoutePath("out", candidate));
  return readU16(raw, raw.byteLength / 2, `route block ${candidate}`);
}
