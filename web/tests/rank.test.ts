import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { RankError } from "../core/errors";
import { rank } from "../core/rank";
import type { ParticipantInput, RankResult } from "../core/types";
import { arbData, lineStations, makeData, NONE16, NONE8 } from "./fixtures";

const ids = (r: RankResult): string[] => r.candidates.map((c) => c.station.id);

/** 4 stations, 3 candidates. s3 is a far suburb with an early last train from s0. */
const data = makeData({
  stations: lineStations(4, (i) => [3, 2, 2, 1][i]!),
  nCandidates: 3,
  out: [
    [0, 10, 20],
    [10, 0, 10],
    [20, 10, 0],
    [40, 30, 20],
  ],
  home: [
    [0, 10, 20, 45],
    [10, 0, 10, 35],
    [20, 10, 0, 25],
  ],
  outXfer: [
    [0, 1, 1],
    [1, 0, 0],
    [1, 0, 0],
    [2, 1, 0],
  ],
  homeXfer: [
    [0, 1, 1, 2],
    [1, 0, 0, 1],
    [1, 0, 0, 0],
  ],
  lastDep: [
    [0xfffe, 1500, 1500, 22 * 60 + 40],
    [1500, 0xfffe, 1500, 23 * 60 + 30],
    [1500, 1500, 0xfffe, 24 * 60 + 10],
  ],
});

const people = (...pairs: [string, string][]): ParticipantInput[] =>
  pairs.map(([s, h], i) => ({ label: `p${i}`, start: { station: s }, home: { station: h } }));

describe("cost model", () => {
  it("adds outbound, home, lambda per transfer and walking", () => {
    const r = rank(people(["s0", "s3"]), { lambda: 5 }, data);
    const at = (id: string) => r.candidates.find((c) => c.station.id === id)!;
    const p = at("s1").people[0]!;
    expect(p).toMatchObject({ outMinutes: 10, homeMinutes: 35, outTransfers: 1, homeTransfers: 1, walkMinutes: 0 });
    expect(p.cost).toBe(10 + 35 + 5 * 2);
    expect(at("s2").people[0]!.cost).toBe(20 + 25 + 5 * 1);
  });

  it("computes total, average, worst, spread and the objective", () => {
    const r = rank(people(["s0", "s0"], ["s3", "s3"]), { alpha: 0.25, lambda: 0 }, data);
    const c = r.candidates.find((x) => x.station.id === "s1")!;
    // s0: 10 + 10 = 20 ; s3: 30 + 35 = 65
    expect(c.total).toBe(85);
    expect(c.average).toBe(42.5);
    expect(c.worst).toEqual({ label: "p1", cost: 65 });
    expect(c.spread).toBe(45);
    expect(c.objective).toBeCloseTo(0.25 * 42.5 + 0.75 * 65, 10);
  });

  it("home defaults to start, and ignoreHome drops the home leg", () => {
    const r = rank([{ label: "a", start: { station: "s3" } }], { lambda: 0 }, data);
    expect(r.candidates.find((c) => c.station.id === "s2")!.people[0]!.cost).toBe(20 + 25);
    const o = rank([{ label: "a", start: { station: "s3" } }], { lambda: 0, ignoreHome: true }, data);
    expect(o.candidates.find((c) => c.station.id === "s2")!.people[0]!.cost).toBe(20);
  });

  it("breaks ties by more lines, then lower spread", () => {
    const tie = makeData({
      stations: lineStations(3, (i) => [1, 3, 2][i]!),
      nCandidates: 3,
      out: [[0, 10, 10], [10, 0, 10], [10, 10, 0]],
      home: [[0, 10, 10], [10, 0, 10], [10, 10, 0]],
    });
    const r = rank(people(["s0", "s0"]), { lambda: 0 }, tie);
    expect(ids(r)).toEqual(["s0", "s1", "s2"]);
    const r2 = rank(people(["s1", "s1"], ["s2", "s2"]), { lambda: 0, alpha: 1 }, tie);
    // every candidate averages 10; s1 has the most lines
    expect(ids(r2)[0]).toBe("s1");
  });
});

describe("last-train filter", () => {
  it("excludes candidates that strand someone, and says who and when", () => {
    const r = rank(people(["s0", "s0"], ["s3", "s3"]), { meetingEnd: 23 * 60 }, data);
    expect(ids(r)).toEqual(["s2", "s1"]);
    expect(r.excluded).toHaveLength(1);
    expect(r.excluded[0]!.station.id).toBe("s0");
    expect(r.excluded[0]!.reasons.join()).toMatch(/p1.*22:40/);
    const p = r.candidates[0]!.people.find((x) => x.label === "p1")!;
    expect(p.lastTrainOk).toBe(true);
    expect(p.lastDeparture).toBe(24 * 60 + 10);
  });

  it("returns no candidates, with reasons, when nobody can get home", () => {
    const r = rank(people(["s3", "s3"]), { meetingEnd: 24 * 60 + 30 }, data);
    expect(r.candidates).toHaveLength(0);
    expect(r.feasibleCount).toBe(0);
    expect(r.excluded.length).toBeGreaterThan(0);
  });

  it("never filters a person who lives at the candidate", () => {
    const r = rank(people(["s2", "s2"]), { meetingEnd: 26 * 60 }, data);
    expect(ids(r)).toContain("s2");
    expect(r.candidates.find((c) => c.station.id === "s2")!.people[0]!.lastDeparture).toBeNull();
  });
});

describe("unreachable cells", () => {
  it("excludes a candidate nobody can reach and names the person", () => {
    const holes = makeData({
      stations: lineStations(3),
      nCandidates: 2,
      out: [[0, 10], [10, 0], [NONE16, 10]],
      home: [[0, 10, 10], [10, 0, 10]],
      outXfer: [[0, 0], [0, 0], [NONE8, 0]],
    });
    const r = rank([{ label: "far", start: { station: "s2" } }], {}, holes);
    expect(ids(r)).toEqual(["s1"]);
    expect(r.excluded[0]!.reasons.join()).toMatch(/far/);
  });

  it("errors, naming the station, when a start reaches no candidate at all", () => {
    const holes = makeData({
      stations: lineStations(3),
      nCandidates: 2,
      out: [[0, 10], [10, 0], [NONE16, NONE16]],
      home: [[0, 10, 10], [10, 0, 10]],
    });
    expect(() => rank([{ label: "x", start: { station: "s2" } }], {}, holes)).toThrow(/Station 2/);
  });
});

describe("input validation", () => {
  const bad = (p: readonly ParticipantInput[], o: object = {}) => {
    try {
      rank(p, o, data);
    } catch (e) {
      return (e as RankError).code;
    }
    return "NONE";
  };
  it.each([
    [{ alpha: 1.5 }, "BAD_OPTION"],
    [{ alpha: Number.NaN }, "BAD_OPTION"],
    [{ lambda: -1 }, "BAD_OPTION"],
    [{ limit: 0 }, "BAD_OPTION"],
    [{ meetingEnd: -5 }, "BAD_OPTION"],
  ])("rejects option %j", (opts, c) => {
    expect(bad(people(["s0", "s0"]), opts)).toBe(c);
  });

  it("rejects empty and oversized groups and bad participants", () => {
    expect(bad([])).toBe("NO_PARTICIPANTS");
    expect(bad(Array.from({ length: 51 }, () => people(["s0", "s0"])[0]!))).toBe("TOO_MANY_PARTICIPANTS");
    expect(bad([{ label: "", start: { station: "s0" } }])).toBe("BAD_PARTICIPANT");
    expect(bad([{ label: "x", start: {} as never }])).toBe("BAD_PARTICIPANT");
  });

  it("does not mutate its inputs", () => {
    const input = Object.freeze(people(["s0", "s3"]).map((p) => Object.freeze(p)));
    const opts = Object.freeze({ alpha: 0.5 });
    expect(() => rank(input, opts, data)).not.toThrow();
  });
});

const arbPeople = (n: number) =>
  fc.array(
    fc.record({ s: fc.integer({ min: 0, max: n - 1 }), h: fc.integer({ min: 0, max: n - 1 }) }),
    { minLength: 1, maxLength: 6 },
  );

const groupFor = (picks: { s: number; h: number }[]): ParticipantInput[] =>
  picks.map((p, i) => ({ label: `p${i}`, start: { station: `s${p.s}` }, home: { station: `s${p.h}` } }));

function rankOrNull(p: readonly ParticipantInput[], o: object, d: Parameters<typeof rank>[2]): RankResult | null {
  try {
    return rank(p, o, d);
  } catch (e) {
    if (e instanceof RankError && e.code === "UNROUTABLE_STATION") return null;
    throw e;
  }
}

describe("properties on random data", () => {
  it("identity: everyone starting and living at a candidate puts it first at cost 0", () => {
    fc.assert(
      fc.property(arbData, fc.nat(), (d, x) => {
        const id = `s${x % d.nCandidates}`;
        const r = rankOrNull(people([id, id], [id, id]), {}, d);
        if (r === null) return;
        expect(r.candidates[0]!.station.id).toBe(id);
        expect(r.candidates[0]!.objective).toBe(0);
      }),
    );
  });

  it("permutation invariance: any order of participants gives the same ranking", () => {
    fc.assert(
      fc.property(
        arbData.chain((d) => fc.tuple(fc.constant(d), arbPeople(d.nStations))),
        fc.integer({ min: 0, max: 10 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 10, noNaN: true }),
        ([d, picks], rot, alpha, lambda) => {
          const g = groupFor(picks);
          const shuffled = [...g.slice(rot % g.length), ...g.slice(0, rot % g.length)].reverse();
          const a = rankOrNull(g, { alpha, lambda, limit: 100 }, d);
          const b = rankOrNull(shuffled, { alpha, lambda, limit: 100 }, d);
          expect(a === null).toBe(b === null);
          if (a && b) expect(ids(b)).toEqual(ids(a));
        },
      ),
    );
  });

  it("copies of one person rank like that person alone", () => {
    fc.assert(
      fc.property(
        arbData.chain((d) => fc.tuple(fc.constant(d), arbPeople(d.nStations))),
        fc.integer({ min: 2, max: 20 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        ([d, picks], copies, alpha) => {
          const one = groupFor(picks.slice(0, 1));
          const many = Array.from({ length: copies }, (_, i) => ({ ...one[0]!, label: `c${i}` }));
          const a = rankOrNull(one, { alpha, limit: 100 }, d);
          const b = rankOrNull(many, { alpha, limit: 100 }, d);
          if (a && b) expect(ids(b)).toEqual(ids(a));
        },
      ),
    );
  });

  it("objective extremes: alpha 0 never has a worse worst case than alpha 1", () => {
    fc.assert(
      fc.property(arbData.chain((d) => fc.tuple(fc.constant(d), arbPeople(d.nStations))), ([d, picks]) => {
        const g = groupFor(picks);
        const fair = rankOrNull(g, { alpha: 0 }, d);
        const efficient = rankOrNull(g, { alpha: 1 }, d);
        if (!fair?.candidates[0] || !efficient?.candidates[0]) return;
        expect(fair.candidates[0].worst.cost).toBeLessThanOrEqual(efficient.candidates[0].worst.cost);
        expect(efficient.candidates[0].average).toBeLessThanOrEqual(fair.candidates[0].average);
      }),
    );
  });

  it("the Pareto set is exactly the non-dominated feasible candidates", () => {
    fc.assert(
      fc.property(arbData.chain((d) => fc.tuple(fc.constant(d), arbPeople(d.nStations))), ([d, picks]) => {
        const r = rankOrNull(groupFor(picks), { limit: 1000 }, d);
        if (!r) return;
        const pts = r.candidates.map((c) => ({ id: c.station.id, a: c.average, w: c.worst.cost }));
        const dominated = (p: (typeof pts)[number]) =>
          pts.some((q) => q.a <= p.a && q.w <= p.w && (q.a < p.a || q.w < p.w));
        const expected = pts.filter((p) => !dominated(p)).map((p) => p.id).sort();
        expect(r.pareto.map((p) => p.station.id).sort()).toEqual(expected);
        const avgs = r.pareto.map((p) => p.average);
        expect(avgs).toEqual([...avgs].sort((x, y) => x - y));
      }),
    );
  });

  it("last-train filter: every returned candidate gets everyone home, every exclusion has a reason", () => {
    fc.assert(
      fc.property(
        arbData.chain((d) => fc.tuple(fc.constant(d), arbPeople(d.nStations))),
        fc.integer({ min: 20 * 60, max: 26 * 60 }),
        ([d, picks], end) => {
          const r = rankOrNull(groupFor(picks), { meetingEnd: end, limit: 1000 }, d);
          if (!r) return;
          for (const c of r.candidates) {
            for (const p of c.people) expect(p.lastTrainOk === true || p.lastDeparture === null).toBe(true);
          }
          for (const e of r.excluded) expect(e.reasons.length).toBeGreaterThan(0);
          expect(r.candidates.length + r.excluded.length).toBe(d.nCandidates);
        },
      ),
    );
  });

  it("ranking is sorted by objective and limited", () => {
    fc.assert(
      fc.property(
        arbData.chain((d) => fc.tuple(fc.constant(d), arbPeople(d.nStations))),
        fc.integer({ min: 1, max: 5 }),
        ([d, picks], limit) => {
          const r = rankOrNull(groupFor(picks), { limit }, d);
          if (!r) return;
          expect(r.candidates.length).toBeLessThanOrEqual(limit);
          const obj = r.candidates.map((c) => c.objective);
          expect(obj).toEqual([...obj].sort((x, y) => x - y));
          expect(r.candidates.map((c) => c.rank)).toEqual(r.candidates.map((_, i) => i + 1));
        },
      ),
    );
  });
});
