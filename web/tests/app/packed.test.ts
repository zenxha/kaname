/** Packed data for the web: gzip copies of the matrices and one small gzip file per station's route block. */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { MATRIX_FILES } from "../../core/data";
import { gunzip, isGzip, packedMatrixPath, packedRoutePath } from "../../src/data/packed";
import { packCache, packData } from "../../scripts/pack";
import { DATA_DIR, real } from "../realData";

describe("packed data", () => {
  const packed = packData(DATA_DIR);

  it("has a gzip copy of every matrix that unpacks to the same bytes", async () => {
    for (const f of MATRIX_FILES) {
      const gz = packed.get(packedMatrixPath(f))!;
      expect(isGzip(gz)).toBe(true);
      expect(Buffer.from(await gunzip(gz)).equals(readFileSync(join(DATA_DIR, f)))).toBe(true);
    }
  });

  it("has one block per station and direction, cut at the route index", async () => {
    const raw = readFileSync(join(DATA_DIR, "home_routes.u16"));
    const idx = new Uint32Array(new Uint8Array(readFileSync(join(DATA_DIR, "home_routes_idx.u32"))).buffer);
    for (const k of [0, 1, real.nCandidates - 1]) {
      const block = await gunzip(packed.get(packedRoutePath("home", k))!);
      expect(Buffer.from(block).equals(raw.subarray(idx[k]! * 2, idx[k + 1]! * 2))).toBe(true);
    }
    expect(packed.size).toBe(MATRIX_FILES.length + 2 * real.nCandidates);
  });

  it("is small: a whole first visit's data is well under 2 MB, and a station's routes a few KB", () => {
    const matrices = MATRIX_FILES.reduce((n, f) => n + packed.get(packedMatrixPath(f))!.byteLength, 0);
    expect(matrices).toBeLessThan(1.5 * 1024 * 1024);
    expect(packed.get(packedRoutePath("out", 0))!.byteLength).toBeLessThan(16 * 1024);
  });

  it("is the same every build", () => {
    expect(Buffer.from(packData(DATA_DIR).get(packedRoutePath("out", 3))!).equals(Buffer.from(packed.get(packedRoutePath("out", 3))!))).toBe(true);
  });

  it("tells gzip from an HTML page that a host sends for a missing file", async () => {
    expect(isGzip(new TextEncoder().encode("<!doctype html>"))).toBe(false);
    expect([...await gunzip(gzipSync(Uint8Array.from([5, 0, 6])))]).toEqual([5, 0, 6]);
  });

  it("packs again in development when a data file changes", async () => {
    const dir = mkdtempSync(join(tmpdir(), "kaname-pack-"));
    try {
      const write = (minutes: number) => {
        for (const f of MATRIX_FILES) writeFileSync(join(dir, f), Uint8Array.from([minutes, 0]));
        for (const d of ["out", "home"]) {
          writeFileSync(join(dir, `${d}_routes.u16`), Uint8Array.from([minutes, 0]));
          writeFileSync(join(dir, `${d}_routes_idx.u32`), new Uint8Array(Uint32Array.from([0, 1]).buffer));
        }
      };
      write(1);
      const files = packCache(dir);
      expect([...await gunzip(files().get(packedRoutePath("out", 0))!)]).toEqual([1, 0]);
      write(2);
      expect([...await gunzip(files().get(packedRoutePath("out", 0))!)]).toEqual([2, 0]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
