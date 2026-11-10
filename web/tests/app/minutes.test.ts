/** The app shows plain trip minutes. The transfer penalty only orders the stations. */
import { describe, expect, it } from "vitest";
import { DEFAULT_LAMBDA, rank } from "../../core/rank";
import { changesText, compareToFirst, comparisonText, plainSummary, tripMinutes } from "../../src/model/compare";
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

  it("count everyone's changes of train, there and back, so the order can be explained", () => {
    const best = rank([SHIZUKU, TORA], {}, real).candidates[0]!;
    expect(plainSummary(best).changes).toBe(best.people.reduce((n, p) => n + p.outTransfers + p.homeTransfers, 0));
    expect(plainSummary(best).changes).toBe(6); // 神田: Shizuku 1 + 1, Tora 2 + 2
  });

  it("say changes in both languages, with the right form for one", () => {
    expect(changesText("en", 1)).toBe("1 change");
    expect(changesText("en", 6)).toBe("6 changes");
    expect(changesText("ja", 6)).toBe("乗換6回");
  });

  it("drive the comparison with the first station", () => {
    const [first, second] = rank([SHIZUKU, TORA], {}, real).candidates;
    const c = compareToFirst(second!, first!)!;
    expect(c.average).toBe(Math.round(plainSummary(second!).average) - Math.round(plainSummary(first!).average));
    expect(c.people.map((p) => p.minutes)).toEqual(second!.people.map((p, i) => tripMinutes(p) - tripMinutes(first!.people[i]!)));
  });

  it("name each person's change in changes of train, so a lower station's rank makes sense", () => {
    const [first, second] = rank([SHIZUKU, TORA], {}, real).candidates; // 神田, then 日暮里
    const c = compareToFirst(second!, first!)!;
    expect(c.people.map((p) => p.changes)).toEqual([0, -2]); // Tora: 4 changes at 神田, 2 at 日暮里
    expect(comparisonText("en", c)).toBe("6 min less on average than Kanda. Shizuku's trip is 22 min longer, Tora's trip is 34 min shorter and has 2 fewer changes.");
    expect(comparisonText("ja", c)).toBe("平均は神田より6分短い。Shizukuは22分長い、Toraは34分短い（乗換2回少ない）。");
  });

  it("say one change in the singular", () => {
    const c = { station: real.stations[0]!, average: 0, people: [{ label: "Aki", minutes: 3, changes: 1 }, { label: "Ben", minutes: 0, changes: -1 }] };
    expect(comparisonText("en", c)).toMatch(/Aki's trip is 3 min longer and has 1 more change, Ben's trip is the same and has 1 fewer change\.$/);
  });

  it("say \"but\" when the minutes and the changes go different ways", () => {
    const c = { station: real.stations[0]!, average: -2, people: [{ label: "Aki", minutes: -5, changes: 2 }, { label: "Ben", minutes: 4, changes: -1 }] };
    expect(comparisonText("en", c)).toMatch(/Aki's trip is 5 min shorter but has 2 more changes, Ben's trip is 4 min longer but has 1 fewer change\.$/);
  });
});
