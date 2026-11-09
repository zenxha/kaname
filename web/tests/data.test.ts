import { describe, expect, it } from "vitest";
import { parseData, SAME_STATION, UNREACHABLE } from "../core/data";
import { RankError } from "../core/errors";
import { lineStations, rawFiles, type FixtureSpec } from "./fixtures";

const spec: FixtureSpec = {
  stations: lineStations(3),
  nCandidates: 2,
  out: [[0, 10], [10, 0], [20, 12]],
  home: [[0, 11, 21], [9, 0, 13]],
};

function expectBadData(fn: () => unknown, message: RegExp): void {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(RankError);
    expect((e as RankError).code).toBe("BAD_DATA");
    expect((e as RankError).message).toMatch(message);
    return;
  }
  throw new Error("expected a BAD_DATA error");
}

describe("parseData", () => {
  it("reads little-endian matrices and station records", () => {
    const f = rawFiles(spec);
    const d = parseData(f.meta, f.stations, f.buffers);
    expect(d.nStations).toBe(3);
    expect(d.nCandidates).toBe(2);
    expect(d.outMin[2 * 2 + 1]).toBe(12);
    expect(d.homeMin[1 * 3 + 2]).toBe(13);
    expect(d.lastDep[0]).toBe(SAME_STATION);
    expect(d.stations[1]!.id).toBe("s1");
    expect(d.stations[1]!.candidate).toBe(true);
    expect(UNREACHABLE).toBe(0xffff);
  });

  it("accepts ArrayBuffer inputs too", () => {
    const f = rawFiles(spec);
    const buffers = Object.fromEntries(
      Object.entries(f.buffers).map(([k, v]) => [k, v.slice().buffer as ArrayBuffer]),
    );
    expect(parseData(f.meta, f.stations, buffers).outMin[1]).toBe(10);
  });

  it("rejects a wrong format version", () => {
    const f = rawFiles(spec);
    expectBadData(() => parseData({ ...(f.meta as object), format: 2 }, f.stations, f.buffers), /format/);
  });

  it("rejects a missing file", () => {
    const f = rawFiles(spec);
    const { ["home_min.u16"]: _gone, ...rest } = f.buffers;
    expectBadData(() => parseData(f.meta, f.stations, rest), /home_min\.u16/);
  });

  it("rejects a truncated file", () => {
    const f = rawFiles(spec);
    expectBadData(
      () => parseData(f.meta, f.stations, { ...f.buffers, "out_min.u16": new Uint8Array(4) }),
      /out_min\.u16/,
    );
  });

  it("rejects station counts that disagree with meta", () => {
    const f = rawFiles(spec);
    const st = f.stations as { n_stations: number };
    expectBadData(() => parseData(f.meta, { ...st, n_stations: 4 }, f.buffers), /stations/);
  });

  it("rejects malformed station records", () => {
    const f = rawFiles(spec);
    const st = f.stations as { stations: unknown[] };
    const broken = { ...st, stations: [...st.stations.slice(0, 2), { id: 5 }] };
    expectBadData(() => parseData(f.meta, broken, f.buffers), /station 2/);
    expectBadData(() => parseData(null, f.stations, f.buffers), /meta/);
    expectBadData(() => parseData(f.meta, "x", f.buffers), /stations/);
  });

  it("rejects duplicate station ids", () => {
    const f = rawFiles({ ...spec, stations: [...lineStations(2), { ...lineStations(1)[0]!, id: "s0" }] });
    expectBadData(() => parseData(f.meta, f.stations, f.buffers), /duplicate/);
  });
});
