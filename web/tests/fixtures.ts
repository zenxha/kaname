/** Synthetic data sets in the exact on-disk format, so tests also exercise parseData. */
import fc from "fast-check";
import { parseData, type MatrixData } from "../core/data";

export const NONE16 = 0xffff;
export const SAME16 = 0xfffe;
export const NONE8 = 0xff;

export interface FixtureStation {
  readonly id: string;
  readonly ja: string;
  readonly en: string;
  readonly lat: number;
  readonly lng: number;
  readonly lines: number;
  readonly aliases?: readonly string[];
}

export interface FixtureSpec {
  /** Candidates first: stations[0..nCandidates) are the candidates. */
  readonly stations: readonly FixtureStation[];
  readonly nCandidates: number;
  /** [station][candidate] minutes */
  readonly out: readonly (readonly number[])[];
  /** [candidate][station] minutes */
  readonly home: readonly (readonly number[])[];
  readonly outXfer?: readonly (readonly number[])[];
  readonly homeXfer?: readonly (readonly number[])[];
  readonly lastDep?: readonly (readonly number[])[];
}

export interface RawFiles {
  readonly meta: unknown;
  readonly stations: unknown;
  readonly buffers: Readonly<Record<string, Uint8Array>>;
}

function u16(values: readonly number[]): Uint8Array {
  const out = new Uint8Array(values.length * 2);
  const view = new DataView(out.buffer);
  values.forEach((v, i) => view.setUint16(i * 2, v, true));
  return out;
}

function grid(rows: number, cols: number, fill: (r: number, c: number) => number): number[][] {
  return Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => fill(r, c)));
}

export function rawFiles(spec: FixtureSpec): RawFiles {
  const n = spec.stations.length;
  const k = spec.nCandidates;
  const outX = spec.outXfer ?? grid(n, k, () => 0);
  const homeX = spec.homeXfer ?? grid(k, n, () => 0);
  const last = spec.lastDep ?? grid(k, n, (c, s) => (c === s ? SAME16 : 24 * 60));
  const shape = (rows: number, cols: number) => ({ shape: [rows, cols] });
  const meta = {
    format: 1,
    counts: { stations: n, candidates: k },
    files: {
      "out_min.u16": { dtype: "uint16", ...shape(n, k) },
      "out_xfer.u8": { dtype: "uint8", ...shape(n, k) },
      "home_min.u16": { dtype: "uint16", ...shape(k, n) },
      "home_xfer.u8": { dtype: "uint8", ...shape(k, n) },
      "last_dep.u16": { dtype: "uint16", ...shape(k, n) },
    },
  };
  const stations = {
    format: 1,
    n_stations: n,
    n_candidates: k,
    railways: [{ i: 0, id: "Op.A", ja: "A線", en: "A Line", color: "#000000", stations: spec.stations.map((_, i) => i), loop: false }],
    stations: spec.stations.map((s, i) => ({
      i,
      id: s.id,
      ja: s.ja,
      en: s.en,
      aliases: s.aliases ?? [s.ja, s.en],
      lat: s.lat,
      lng: s.lng,
      lines: s.lines,
      candidate: i < k,
      railways: [0],
      stops: [[0, s.lng, s.lat]],
      dist_km: 0,
    })),
  };
  return {
    meta,
    stations,
    buffers: {
      "out_min.u16": u16(spec.out.flat()),
      "out_xfer.u8": Uint8Array.from(outX.flat()),
      "home_min.u16": u16(spec.home.flat()),
      "home_xfer.u8": Uint8Array.from(homeX.flat()),
      "last_dep.u16": u16(last.flat()),
    },
  };
}

export function makeData(spec: FixtureSpec): MatrixData {
  const f = rawFiles(spec);
  return parseData(f.meta, f.stations, f.buffers);
}

/** Stations on a line of longitudes near Tokyo, 1 km apart. */
export function lineStations(n: number, linesOf: (i: number) => number = () => 2): FixtureStation[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `s${i}`,
    ja: `駅${i}`,
    en: `Station ${i}`,
    lat: 35.68,
    lng: 139.7 + i * 0.011,
    lines: linesOf(i),
  }));
}

/** Random but valid data: zero diagonal for candidates, a few unreachable cells, early last trains. */
export const arbData: fc.Arbitrary<MatrixData> = fc
  .record({ n: fc.integer({ min: 3, max: 9 }), kFrac: fc.double({ min: 0.3, max: 1, noNaN: true }) })
  .chain(({ n, kFrac }) => {
    const k = Math.max(2, Math.min(n, Math.round(n * kFrac)));
    const minutes = fc.oneof({ weight: 12, arbitrary: fc.integer({ min: 1, max: 90 }) }, {
      weight: 1,
      arbitrary: fc.constant(NONE16),
    });
    return fc.record({
      out: fc.array(fc.array(minutes, { minLength: k, maxLength: k }), { minLength: n, maxLength: n }),
      home: fc.array(fc.array(minutes, { minLength: n, maxLength: n }), { minLength: k, maxLength: k }),
      outXfer: fc.array(fc.array(fc.integer({ min: 0, max: 3 }), { minLength: k, maxLength: k }), {
        minLength: n,
        maxLength: n,
      }),
      homeXfer: fc.array(fc.array(fc.integer({ min: 0, max: 3 }), { minLength: n, maxLength: n }), {
        minLength: k,
        maxLength: k,
      }),
      lastDep: fc.array(fc.array(fc.integer({ min: 21 * 60, max: 25 * 60 }), { minLength: n, maxLength: n }), {
        minLength: k,
        maxLength: k,
      }),
      lines: fc.array(fc.integer({ min: 1, max: 5 }), { minLength: n, maxLength: n }),
    }).map((r) => {
      const fixDiagOut = r.out.map((row, s) => row.map((v, c) => (s === c ? 0 : v)));
      const fixHome = r.home.map((row, c) => row.map((v, s) => (s === c ? 0 : v)));
      const fixOutX = r.outXfer.map((row, s) => row.map((v, c) => (fixDiagOut[s]![c] === NONE16 ? NONE8 : s === c ? 0 : v)));
      const fixHomeX = r.homeXfer.map((row, c) => row.map((v, s) => (fixHome[c]![s] === NONE16 ? NONE8 : s === c ? 0 : v)));
      const fixLast = r.lastDep.map((row, c) => row.map((v, s) => (s === c ? SAME16 : v)));
      return makeData({
        stations: lineStations(n, (i) => r.lines[i]!),
        nCandidates: k,
        out: fixDiagOut,
        home: fixHome,
        outXfer: fixOutX,
        homeXfer: fixHomeX,
        lastDep: fixLast,
      });
    });
  });
