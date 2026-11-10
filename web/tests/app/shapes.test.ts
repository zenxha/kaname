/** Track shapes (data/shapes.json): the track between each pair of neighboring stations on a railway. */
import { describe, expect, it } from "vitest";
import { stationPoint } from "../../src/model/geometry";
import { decodePolyline, parseShapes, stationsChecksum } from "../../src/model/shapes";
import { real, realShapes, realStationsSha } from "../realData";

/** The pairs on a railway: one fewer than its stations, plus one back to the start on a loop. */
const pairs = (i: number) => {
  const r = real.railways[i]!;
  return r.stations.length - 1 + (r.loop && r.stations.length > 2 ? 1 : 0);
};

/** A document with every entry empty, shaped for the real data. */
const SHA = "a".repeat(64);
const emptyDoc = () => ({ format: 1, precision: 5, stations_sha256: SHA, railways: real.railways.map((_, i) => Array<string>(Math.max(pairs(i), 0)).fill("")) });

describe("track shapes", () => {
  it("decode the published polyline example as longitude, latitude pairs", () => {
    expect(decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@")).toEqual([[-120.2, 38.5], [-120.95, 40.7], [-126.453, 43.252]]);
    expect(decodePolyline("")).toEqual([]);
  });

  it("refuse a broken polyline instead of drawing nonsense", () => {
    expect(() => decodePolyline("_p~iF~ps|")).toThrow(); // ends inside a value
    expect(() => decodePolyline("_p~iF ")).toThrow();    // a character outside the alphabet
  });

  it("read an empty entry as a straight line", () => {
    const shapes = parseShapes(emptyDoc(), real, SHA)!;
    expect(shapes).toHaveLength(real.railways.length);
    expect(shapes.every((r) => r.every((s) => s === null))).toBe(true);
  });

  it("ignore a file that does not fit the station data, so the map falls back to straight lines", () => {
    const doc = emptyDoc();
    expect(parseShapes(null, real, SHA)).toBeNull();
    expect(parseShapes({ ...doc, format: 2 }, real, SHA)).toBeNull();
    expect(parseShapes({ ...doc, railways: doc.railways.slice(1) }, real, SHA)).toBeNull();
    expect(parseShapes({ ...doc, railways: [[...doc.railways[0]!, ""], ...doc.railways.slice(1)] }, real, SHA)).toBeNull();
    expect(parseShapes({ ...doc, railways: [["_p~iF~ps|"], ...doc.railways.slice(1)] }, real, SHA)).toBeNull();
  });

  it("ignore a file built from other station data, even when every count fits", () => {
    expect(parseShapes(emptyDoc(), real, "b".repeat(64))).toBeNull();
    expect(parseShapes(emptyDoc(), real, null)).toBeNull();
    expect(stationsChecksum({ files: { "stations.json": { sha256: SHA } } })).toBe(SHA);
    expect(stationsChecksum({ files: {} })).toBeNull();
  });

  it("cover almost every pair of neighboring stations in the real data", () => {
    const shapes = realShapes()!;
    const all = shapes.flat();
    expect(all.length).toBe(real.railways.reduce((n, _, i) => n + Math.max(pairs(i), 0), 0));
    expect(all.filter((s) => s !== null).length / all.length).toBeGreaterThan(0.99);
  });

  it("run into the stations at both ends instead of stopping short", () => {
    const shapes = realShapes()!;
    const gaps = real.railways.flatMap((r, i) => {
      const n = r.stations.length;
      return shapes[i]!.flatMap((shape, k) => {
        if (shape === null) return [];
        const [a, b] = [r.stations[k]!, r.stations[(k + 1) % n]!];
        return [[shape[0]!, stationPoint(real, a, i)], [shape.at(-1)!, stationPoint(real, b, i)]].map(
          ([p, q]) => Math.hypot((p![0] - q![0]) * 90_400, (p![1] - q![1]) * 110_540));
      });
    }).sort((x, y) => x - y);
    expect(realStationsSha).not.toBeNull();
    expect(gaps[Math.floor(gaps.length / 2)]).toBeLessThan(60);     // median, in metres
    expect(gaps[Math.floor(gaps.length * 0.95)]).toBeLessThan(150);
    expect(gaps.at(-1)).toBeLessThan(400);                          // Keisei at 日暮里 sits 350 m off the track
  });
});
