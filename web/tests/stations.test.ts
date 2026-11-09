import { describe, expect, it } from "vitest";
import { RankError } from "../core/errors";
import { findStation, snapToStations, walkMinutes } from "../core/stations";
import { lineStations, makeData } from "./fixtures";

const stations = [
  ...lineStations(3),
  { id: "kasumigaseki-tobu", ja: "霞ケ関", en: "Kasumigaseki", lat: 35.9, lng: 139.4, lines: 1 },
  { id: "kasumigaseki", ja: "霞ケ関", en: "Kasumigaseki", lat: 35.674, lng: 139.751, lines: 3 },
  { id: "ichigaya", ja: "市ケ谷", en: "Ichigaya", lat: 35.69, lng: 139.736, lines: 4, aliases: ["市ヶ谷", "Ichigaya"] },
];
const n = stations.length;
const data = makeData({
  stations,
  nCandidates: 2,
  out: Array.from({ length: n }, () => [5, 5]),
  home: [Array.from({ length: n }, () => 5), Array.from({ length: n }, () => 5)],
});

function code(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    return e instanceof RankError ? e.code : "OTHER";
  }
  return "NONE";
}

describe("findStation", () => {
  it("finds by id, Japanese name, English name and alias", () => {
    expect(findStation(data, "s1")).toBe(1);
    expect(findStation(data, "駅2")).toBe(2);
    expect(findStation(data, "  station 0 ")).toBe(0);
    expect(findStation(data, "市ヶ谷")).toBe(5);
    expect(findStation(data, "ICHIGAYA")).toBe(5);
  });

  it("names every match when a name is ambiguous", () => {
    expect(code(() => findStation(data, "霞ケ関"))).toBe("AMBIGUOUS_STATION");
    expect(() => findStation(data, "霞ケ関")).toThrow(/kasumigaseki-tobu.*kasumigaseki|kasumigaseki.*kasumigaseki-tobu/);
    expect(findStation(data, "kasumigaseki")).toBe(4); // an exact id wins
  });

  it("names the station when it is not in the data", () => {
    expect(code(() => findStation(data, "小田原"))).toBe("UNKNOWN_STATION");
    expect(() => findStation(data, "小田原")).toThrow(/小田原/);
    expect(code(() => findStation(data, "   "))).toBe("UNKNOWN_STATION");
  });
});

describe("snapToStations", () => {
  it("returns the 3 nearest stations with walking time", () => {
    const snaps = snapToStations(data, 35.68, 139.7 + 0.011 + 0.0005);
    expect(snaps.map((s) => s.index)).toEqual([1, 2, 0]);
    expect(snaps[0]!.distanceM).toBeGreaterThan(30);
    expect(snaps[0]!.distanceM).toBeLessThan(60);
    expect(snaps[0]!.walkMinutes).toBe(walkMinutes(snaps[0]!.distanceM));
  });

  it("uses 80 m/min with a 1.3 detour factor, rounded up", () => {
    expect(walkMinutes(0)).toBe(0);
    expect(walkMinutes(400)).toBe(7); // 400 * 1.3 / 80 = 6.5
    expect(walkMinutes(80 / 1.3)).toBe(1);
  });

  it("refuses a point too far from any station", () => {
    expect(code(() => snapToStations(data, 34.0, 135.0))).toBe("LOCATION_TOO_FAR");
  });

  it("rejects coordinates that are not numbers in range", () => {
    expect(code(() => snapToStations(data, Number.NaN, 139.7))).toBe("BAD_PARTICIPANT");
    expect(code(() => snapToStations(data, 95, 139.7))).toBe("BAD_PARTICIPANT");
  });
});
