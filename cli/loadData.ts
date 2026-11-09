/** Load the data files from disk (Node only), checking each against its checksum in meta.json. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MATRIX_FILES, parseData, type MatrixData } from "../web/core/data";
import { RankError } from "../web/core/errors";
import { parseRoutes, type RouteData } from "../web/core/routes";

const ROUTE_FILES = ["out_routes.u16", "out_routes_idx.u32", "home_routes.u16", "home_routes_idx.u32"] as const;

export function defaultDataDir(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "data");
}

function readJson(dir: string, name: string): unknown {
  try {
    return JSON.parse(readFileSync(join(dir, name), "utf-8")) as unknown;
  } catch (e) {
    throw new RankError("BAD_DATA", `cannot read ${join(dir, name)}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function expectedSha(meta: unknown, name: string): string {
  const files = (meta as { files?: Record<string, { sha256?: unknown }> }).files;
  const sha = files?.[name]?.sha256;
  if (typeof sha !== "string") throw new RankError("BAD_DATA", `meta.json has no checksum for ${name}`);
  return sha;
}

function readVerified(dir: string, meta: unknown, name: string): Uint8Array {
  let raw: Buffer;
  try {
    raw = readFileSync(join(dir, name));
  } catch (e) {
    throw new RankError("BAD_DATA", `cannot read ${join(dir, name)}: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (createHash("sha256").update(raw).digest("hex") !== expectedSha(meta, name)) {
    throw new RankError("BAD_DATA", `${name} does not match its checksum in meta.json. Rebuild the data`);
  }
  return new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
}

export function loadMatrixData(dir: string): MatrixData {
  const meta = readJson(dir, "meta.json");
  readVerified(dir, meta, "stations.json");
  const buffers = Object.fromEntries(MATRIX_FILES.map((f) => [f, readVerified(dir, meta, f)]));
  return parseData(meta, readJson(dir, "stations.json"), buffers);
}

export function loadRouteData(dir: string): RouteData {
  const meta = readJson(dir, "meta.json");
  return parseRoutes(meta, Object.fromEntries(ROUTE_FILES.map((f) => [f, readVerified(dir, meta, f)])));
}
