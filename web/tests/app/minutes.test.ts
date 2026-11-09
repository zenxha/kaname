/** The app shows plain trip minutes. The transfer penalty only orders the stations. */
import { describe, expect, it } from "vitest";
import { DEFAULT_LAMBDA, rank } from "../../core/rank";
import { compareToFirst, plainSummary, tripMinutes } from "../../src/model/compare";
import { real } from "../realData";

const SHIZUKU = { label: "Shizuku", start: { station: "seiseki-sakuragaoka" } };
const TORA = { label: "Tora", start: { station: "shibamata" } };
const AKI = { label: "Aki", start: { lat: 35.6905, lng: 139.7003 }, home: { station: "chiba" } };

describe("plain trip minutes", () => {
  it("are the ride there, the ride back and the walk, with no penalty", () => {
    const best = rank([SHIZUKU, AKI], {}, real).candidates[0]!;
    for (const p of best.people) {
      expect(tripMinutes(p)).toBe(p.outMinutes + p.homeMinutes + p.walkMinutes);
      expect(p.cost - tripMinutes(p)).toBe(DEFAULT_LAMBDA * (p.outTransfers + p.homeTransfers));
    }
  });

  it("give the same summary for a station whatever the penalty is", () => {
    const at = (lambda: number) => rank([SHIZUKU, TORA], { lambda, limit: 207 }, real).candidates.find((c) => c.station.id === "jimbocho")!;
    expect(plainSummary(at(0))).toEqual(plainSummary(at(10)));
  });

  it("average everyone's trip and name the longest one", () => {
    const best = rank([SHIZUKU, TORA], {}, real).candidates[0]!;
    const trips = best.people.map(tripMinutes);
    const summary = plainSummary(best);
    expect(summary.average).toBeCloseTo((trips[0]! + trips[1]!) / 2);
    expect(summary.longest.minutes).toBe(Math.max(...trips));
    expect(trips[best.people.findIndex((p) => p.label === summary.longest.label)]).toBe(summary.longest.minutes);
  });

  it("drive the comparison with the first station", () => {
    const [first, second] = rank([SHIZUKU, TORA], {}, real).candidates;
    const c = compareToFirst(second!, first!)!;
    expect(c.average).toBe(Math.round(plainSummary(second!).average) - Math.round(plainSummary(first!).average));
    expect(c.people.map((p) => p.minutes)).toEqual(second!.people.map((p, i) => tripMinutes(p) - tripMinutes(first!.people[i]!)));
  });
});
