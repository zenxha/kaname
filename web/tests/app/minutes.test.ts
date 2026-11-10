/** The app shows plain trip minutes. The transfer penalty only orders the stations. */
import { describe, expect, it } from "vitest";
import { DEFAULT_LAMBDA, rank } from "../../core/rank";
import { changesAllText, changesText, compareToFirst, comparisonText, hardestText, plainSummary, rowMinutes, tripMinutes } from "../../src/model/compare";
import type { CandidateResult } from "../../core/types";
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

  it("stay plain whatever the penalty is, which only picks the hardest trip", () => {
    const at = (lambda: number) => plainSummary(rank([SHIZUKU, TORA], { lambda, limit: 207 }, real).candidates.find((c) => c.station.id === "jimbocho")!);
    const [none, ten] = [at(0), at(10)];
    expect([none.average, none.changes]).toEqual([ten.average, ten.changes]);
    // With no penalty the hardest trip is the longest ride. With one, Tora's 4 changes make that trip the hardest.
    expect(none.hardest).toEqual({ label: "Shizuku", minutes: 99, changes: 2 });
    expect(ten.hardest).toEqual({ label: "Tora", minutes: 86, changes: 4 });
  });

  it("average everyone's trip and name the hardest one: the ranking's worst, where a change counts as minutes", () => {
    const top = rank([SHIZUKU, TORA], {}, real).candidates;
    const best = top[0]!;
    const trips = best.people.map(tripMinutes);
    const summary = plainSummary(best);
    expect(summary.average).toBeCloseTo((trips[0]! + trips[1]!) / 2);
    // 神田: Shizuku rides longer (100 min, 2 changes), but Tora's trip (85 min, 4 changes) is the hardest.
    expect(best.station.id).toBe("kanda");
    expect(summary.hardest).toEqual({ label: "Tora", minutes: 85, changes: 4 });
    expect(summary.hardest.label).toBe(best.worst.label);
    // 九段下 has the shorter longest trip (96 min), but its hardest trip is harder, so it ranks lower.
    const kudan = top.find((c) => c.station.id === "kudanshita")!;
    expect(kudan.rank).toBeGreaterThan(best.rank);
    expect(plainSummary(kudan).hardest).toEqual({ label: "Tora", minutes: 89, changes: 4 });
  });

  it("never show a lower station that looks at least as good on every number", () => {
    const shown = (c: CandidateResult) => {
      const p = plainSummary(c);
      return [Math.round(p.average), p.changes, p.hardest.minutes, p.hardest.changes];
    };
    let seed = 7;
    const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const ids = real.stations.slice(0, real.nCandidates).map((s) => s.id);
    let groups = 0;
    for (let g = 0; g < 150; g++) {
      const people = Array.from({ length: 2 + Math.floor(random() * 4) }, (_, i) => ({ label: `P${i}`, start: { station: ids[Math.floor(random() * ids.length)]! } }));
      const top = rank(people, {}, real).candidates.slice(0, 5).map(shown);
      groups++;
      for (let a = 0; a < top.length; a++) {
        for (let b = a + 1; b < top.length; b++) {
          const [hi, lo] = [top[a]!, top[b]!];
          const looksBetter = lo.every((v, i) => v <= hi[i]!) && lo.some((v, i) => v < hi[i]!);
          expect(looksBetter, `group ${g}: rank ${b + 1} ${lo} looks better than rank ${a + 1} ${hi}`).toBe(false);
        }
      }
    }
    expect(groups).toBe(150);
  });

  it("count everyone's changes of train, there and back, so the order can be explained", () => {
    const best = rank([SHIZUKU, TORA], {}, real).candidates[0]!;
    expect(plainSummary(best).changes).toBe(best.people.reduce((n, p) => n + p.outTransfers + p.homeTransfers, 0));
    expect(plainSummary(best).changes).toBe(6); // 神田: Shizuku 1 + 1, Tora 2 + 2
  });

  it("show a person's ride there, ride back and walk, which add up to their trip", () => {
    const best = rank([SHIZUKU, AKI], {}, real).candidates[0]!;
    const aki = best.people.find((p) => p.label === "Aki")!;
    expect(aki.walkMinutes).toBeGreaterThan(0); // Aki starts from a place, not a station
    expect(rowMinutes("en", aki)).toBe(`${aki.outMinutes} min there · ${aki.homeMinutes} back · ${aki.walkMinutes} min walk`);
    expect(rowMinutes("ja", aki)).toBe(`行き${aki.outMinutes}分 · 帰り${aki.homeMinutes}分 · 徒歩${aki.walkMinutes}分`);
    const shizuku = best.people.find((p) => p.label === "Shizuku")!;
    expect(rowMinutes("en", shizuku)).toBe(`${shizuku.outMinutes} min there · ${shizuku.homeMinutes} back`);
    const only = { ...shizuku, homeMinutes: 0, walkMinutes: 4 };
    expect(rowMinutes("en", only)).toBe(`${only.outMinutes} min there · 4 min walk`);
  });

  it("say changes in both languages, with the right form for one", () => {
    expect(changesText("en", 1)).toBe("1 change");
    expect(changesText("en", 6)).toBe("6 changes");
    expect(changesText("ja", 6)).toBe("乗換6回");
  });

  it("say the group's changes and the hardest trip in both languages", () => {
    expect(changesAllText("en", 1)).toBe("1 change in all");
    expect(changesAllText("en", 6)).toBe("6 changes in all");
    expect(changesAllText("ja", 6)).toBe("乗換 計6回");
    const hardest = { label: "Tora", minutes: 85, changes: 4 };
    expect(hardestText("en", hardest)).toBe("hardest trip, Tora, 4 changes");
    expect(hardestText("ja", hardest)).toBe("負担最大 Tora（乗換4回）");
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
