/** Regression tests for the M2 review findings. */
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadMatrixData } from "../../cli/loadData";
import { main, parsePerson } from "../../cli/rank";
import { spotCheck, spotCheckPassed } from "../../cli/spotcheck";
import { parseData } from "../core/data";
import { RankError } from "../core/errors";
import { rank } from "../core/rank";
import { parseRoutes, routeFor } from "../core/routes";
import { snapToStations } from "../core/stations";
import { lineStations, makeData, NONE16, rawFiles, SAME16 } from "./fixtures";
import { DATA_DIR } from "./realData";

const code = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    return e instanceof RankError ? e.code : `OTHER:${String(e)}`;
  }
  return "NONE";
};

const twoStations = makeData({
  stations: lineStations(3),
  nCandidates: 2,
  out: [[0, 10], [10, 0], [20, 15]],
  home: [[0, 10, NONE16], [10, 0, 30]],
  lastDep: [[SAME16, 1500, 21 * 60 + 14], [1500, SAME16, 1440]],
});

describe("rank review fixes", () => {
  it("explains an early last train when the home window has no usual train", () => {
    const p = [{ label: "far", start: { station: "s2" } }];
    const open = rank(p, {}, twoStations);
    expect(open.candidates.map((c) => c.station.id)).toEqual(["s1"]);
    expect(open.excluded[0]!.reasons[0]).toMatch(/far has no usual train home .*last train 21:14/);
    const late = rank(p, { meetingEnd: 23 * 60 }, twoStations);
    expect(late.excluded[0]!.reasons[0]).toMatch(/last train home .* leaves at 21:14, before the meeting ends at 23:00/);
  });

  it("rejects contradictory or out-of-range options and accepts null options", () => {
    const p = [{ label: "a", start: { station: "s0" } }];
    expect(code(() => rank(p, { ignoreHome: true, meetingEnd: 1380 }, twoStations))).toBe("BAD_OPTION");
    expect(code(() => rank(p, { meetingEnd: 27 * 60 }, twoStations))).toBe("BAD_OPTION");
    expect(code(() => rank(p, { ignoreHome: "yes" } as never, twoStations))).toBe("BAD_OPTION");
    expect(rank(p, null, twoStations).candidates.length).toBeGreaterThan(0);
  });

  it("rejects two participants with the same label", () => {
    const p = [{ label: "a", start: { station: "s0" } }, { label: "a", start: { station: "s1" } }];
    expect(code(() => rank(p, {}, twoStations))).toBe("BAD_PARTICIPANT");
  });

  it("keeps candidates with equal average and worst case together in the Pareto set", () => {
    const d = makeData({
      stations: lineStations(3),
      nCandidates: 3,
      out: [[0, 7, 7], [7, 0, 7], [7, 7, 0]],
      home: [[0, 7, 7], [7, 0, 7], [7, 7, 0]],
    });
    const r = rank([{ label: "a", start: { station: "s0" }, home: { station: "s0" } }], { lambda: 0.1 }, d);
    expect(r.pareto.map((x) => x.station.id)).toEqual(["s0"]);
    const r2 = rank([{ label: "a", start: { station: "s0" }, home: { station: "s1" } }], { lambda: 0.1 }, d);
    expect(r2.pareto.map((x) => x.station.id).sort()).toEqual(["s0", "s1"]);
  });
});

describe("data and snapping review fixes", () => {
  it("drops snap options farther than 2 km", () => {
    const far = makeData({
      stations: lineStations(3).map((s, i) => ({ ...s, lng: 139.7 + i * 0.1 })),
      nCandidates: 2,
      out: [[0, 5], [5, 0], [5, 5]],
      home: [[0, 5, 5], [5, 0, 5]],
    });
    expect(snapToStations(far, 35.68, 139.7005).map((o) => o.index)).toEqual([0]);
  });

  it("rejects railway indexes and coordinates out of range", () => {
    const f = rawFiles({ stations: lineStations(2), nCandidates: 2, out: [[0, 1], [1, 0]], home: [[0, 1], [1, 0]] });
    const st = f.stations as { stations: Record<string, unknown>[] };
    const withStation = (patch: Record<string, unknown>) => ({ ...st, stations: [st.stations[0], { ...st.stations[1], ...patch }] });
    expect(code(() => parseData(f.meta, withStation({ railways: [7] }), f.buffers))).toBe("BAD_DATA");
    expect(code(() => parseData(f.meta, withStation({ lat: 95 }), f.buffers))).toBe("BAD_DATA");
    expect(code(() => parseData(f.meta, withStation({ stops: [[0, 200, 35]] }), f.buffers))).toBe("BAD_DATA");
  });

  it("reads the windows from meta.json, with defaults", () => {
    const f = rawFiles({ stations: lineStations(2), nCandidates: 2, out: [[0, 1], [1, 0]], home: [[0, 1], [1, 0]] });
    const meta = { ...(f.meta as object), windows: { outbound: ["18:00", "20:00"], home: ["22:00", "24:00"] } };
    expect(parseData(meta, f.stations, f.buffers).windows.home).toEqual(["22:00", "24:00"]);
    expect(parseData(f.meta, f.stations, f.buffers).windows.outbound).toEqual(["17:30", "19:30"]);
    expect(code(() => parseData({ ...(f.meta as object), windows: 3 }, f.stations, f.buffers))).toBe("BAD_DATA");
  });
});

describe("route decoding review fixes", () => {
  const u16 = (v: number[]) => new Uint8Array(new Uint16Array(v).buffer);
  const u32 = (v: number[]) => new Uint8Array(new Uint32Array(v).buffer);
  const meta = (outLen: number) => ({
    format: 1,
    counts: { stations: 2, candidates: 1 },
    files: { "out_routes.u16": { shape: [outLen] }, "home_routes.u16": { shape: [2] } },
  });
  // candidate 0: station 0 -> itself (no hops); station 1 -> [railway 3, end 0]
  const good = () => ({
    "out_routes.u16": u16([0, 1, 3, 0]),
    "out_routes_idx.u32": u32([0, 4]),
    "home_routes.u16": u16([0, 0]),
    "home_routes_idx.u32": u32([0, 2]),
  });

  it("decodes a valid block", () => {
    const r = parseRoutes(meta(4), good());
    expect(routeFor(r, "out", 0, 1)).toEqual([{ railway: 3, from: 1, to: 0, seated: false, walk: false }]);
  });

  it("rejects fractional indexes, bad block offsets, truncation and unknown stations", () => {
    const r = parseRoutes(meta(4), good());
    expect(code(() => routeFor(r, "out", 0, 0.5))).toBe("BAD_OPTION");
    expect(code(() => parseRoutes(meta(4), { ...good(), "out_routes_idx.u32": u32([0, 3]) }))).toBe("BAD_DATA");
    expect(code(() => parseRoutes(meta(4), { ...good(), "out_routes_idx.u32": u32([1, 4]) }))).toBe("BAD_DATA");
    const truncated = parseRoutes(meta(3), { ...good(), "out_routes.u16": u16([0, 1, 3]), "out_routes_idx.u32": u32([0, 3]) });
    expect(code(() => routeFor(truncated, "out", 0, 1))).toBe("BAD_DATA");
    const unknown = parseRoutes(meta(4), { ...good(), "out_routes.u16": u16([0, 1, 3, 9]) });
    expect(code(() => routeFor(unknown, "out", 0, 1))).toBe("BAD_DATA");
    expect(code(() => parseRoutes(meta(4), { ...good(), "home_routes.u16": undefined as never }))).toBe("BAD_DATA");
  });
});

describe("CLI review fixes", () => {
  const io = () => {
    const out: string[] = [];
    const err: string[] = [];
    return { out, err, io: { out: (s: string) => out.push(s), err: (s: string) => err.push(s) } };
  };
  const scenario = (obj: unknown): string => {
    const file = join(mkdtempSync(join(tmpdir(), "kaname-")), "s.json");
    writeFileSync(file, JSON.stringify(obj));
    return file;
  };
  const people = [{ label: "a", start: { station: "東京" } }];

  it("rejects unknown or mistyped scenario options instead of ignoring them", () => {
    const t = io();
    expect(main(["--data", DATA_DIR, "--input", scenario({ participants: people, options: { meeting_end: "23:30" } })], t.io)).toBe(2);
    expect(t.err.join()).toMatch(/unknown option "meeting_end"/);
    expect(main(["--data", DATA_DIR, "--input", scenario({ participants: people, options: { alpha: null } })], io().io)).toBe(2);
    expect(main(["--data", DATA_DIR, "--input", scenario({ participants: people, options: { ignoreHome: "false" } })], io().io)).toBe(2);
    expect(main(["--data", DATA_DIR, "--input", scenario({ participants: people, options: 5 })], io().io)).toBe(2);
  });

  it("exits 1 when no station gets everyone home", () => {
    const t = io();
    expect(main(["--data", DATA_DIR, "--person", "a:青梅", "--person", "b:成田", "--end", "26:30"], t.io)).toBe(1);
    expect(t.out.join()).toMatch(/No station gets everyone home/);
  });

  it("rejects malformed person specs and flags that swallow the next flag", () => {
    expect(() => parsePerson("a:x>y>z")).toThrow(/one >/);
    expect(() => parsePerson("a:x>")).toThrow(/empty/);
    expect(main(["--data", "--json", "--person", "a:新宿"], io().io)).toBe(2);
  });

  it("spot check fails with nothing compared and rejects a non-numeric reference", () => {
    const header = "id,origin,destination,query_time,ref_minutes\n";
    const empty = spotCheck(loadMatrixData(DATA_DIR), header);
    expect(spotCheckPassed(empty)).toBe(false);
    expect(() => spotCheck(loadMatrixData(DATA_DIR), `${header}x,新宿,東京,18:30,\n`)).toThrow(/ref_minutes/);
    const file = join(mkdtempSync(join(tmpdir(), "kaname-")), "r.csv");
    writeFileSync(file, header);
    expect(main(["spotcheck", "--data", DATA_DIR, "--refs", file], io().io)).toBe(1);
  });

  it("reports a malformed meta.json as a data error", () => {
    const dir = mkdtempSync(join(tmpdir(), "kaname-data-"));
    writeFileSync(join(dir, "meta.json"), "null");
    writeFileSync(join(dir, "stations.json"), readFileSync(join(DATA_DIR, "stations.json")));
    expect(code(() => loadMatrixData(dir))).toBe("BAD_DATA");
    writeFileSync(join(dir, "meta.json"), "{");
    expect(code(() => loadMatrixData(dir))).toBe("BAD_DATA");
  });
});
