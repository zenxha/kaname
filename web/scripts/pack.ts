/** Builds the packed data (see src/data/packed.ts) from the pipeline's files. Node only: the Vite build uses it. */
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { MATRIX_FILES } from "../core/data";
import { packedMatrixPath, packedRoutePath } from "../src/data/packed";

const gzip = (bytes: Uint8Array): Uint8Array => new Uint8Array(gzipSync(bytes, { level: 9 }));

function routeBlocks(dataDir: string, direction: "out" | "home"): [string, Uint8Array][] {
  const raw = readFileSync(join(dataDir, `${direction}_routes.u16`));
  const idxBytes = readFileSync(join(dataDir, `${direction}_routes_idx.u32`));
  const idx = new DataView(idxBytes.buffer, idxBytes.byteOffset, idxBytes.byteLength);
  const count = idxBytes.byteLength / 4 - 1;
  return Array.from({ length: count }, (_, k): [string, Uint8Array] => {
    const [start, end] = [idx.getUint32(k * 4, true) * 2, idx.getUint32((k + 1) * 4, true) * 2];
    if (end < start || end > raw.byteLength) throw new Error(`${direction}_routes_idx.u32: block ${k} is out of range`);
    return [packedRoutePath(direction, k), gzip(raw.subarray(start, end))];
  });
}

const SOURCES = [...MATRIX_FILES, "out_routes.u16", "out_routes_idx.u32", "home_routes.u16", "home_routes_idx.u32"];

/**
 * The packed files for the dev server: packed again whenever a source file changes (a pipeline rebuild
 * while the server runs), so the routes always match the route index that dev serves.
 */
export function packCache(dataDir: string): () => Map<string, Uint8Array> {
  let key = "";
  let files = new Map<string, Uint8Array>();
  return () => {
    const now = SOURCES.map((f) => {
      const s = statSync(join(dataDir, f));
      return `${f}:${s.size}:${s.mtimeMs}`;
    }).join("|");
    if (now !== key) {
      files = packData(dataDir);
      key = now;
    }
    return files;
  };
}

/** Every packed file by its path in the site. gzip leaves the time out of the header, so builds repeat. */
export function packData(dataDir: string): Map<string, Uint8Array> {
  return new Map([
    ...MATRIX_FILES.map((f): [string, Uint8Array] => [packedMatrixPath(f), gzip(readFileSync(join(dataDir, f)))]),
    ...routeBlocks(dataDir, "out"),
    ...routeBlocks(dataDir, "home"),
  ]);
}
