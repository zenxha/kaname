/** The tuning study in cli/tune.ts: sampled groups, and sweeps of the slider and the transfer penalty. */
import { describe, expect, it } from "vitest";
import { alphaSweep, lambdaSweep, sampleGroups } from "../../cli/tune";
import { rank } from "../core/rank";
import { real, realAddresses } from "./realData";

const towns = realAddresses().towns;
const groups = sampleGroups(real, towns, 7, 40);

describe("sampleGroups", () => {
  it("gives the same groups for the same seed, and other groups for another seed", () => {
    expect(sampleGroups(real, towns, 7, 40)).toEqual(groups);
    expect(sampleGroups(real, towns, 8, 40)).not.toEqual(groups);
  });

  it("makes groups of 2 to 8 people that the engine can always plan", () => {
    expect(groups).toHaveLength(40);
    for (const g of groups) {
      expect(g.people.length).toBeGreaterThanOrEqual(2);
      expect(g.people.length).toBeLessThanOrEqual(8);
      expect(rank(g.people, {}, real).candidates.length).toBeGreaterThan(0);
    }
  });

  it("stops with a clear error when no person can be planned, instead of trying forever", () => {
    const osaka = [{ ...towns[0]!, at: [135.5, 34.69] as const }];
    expect(() => sampleGroups(real, osaka, 1, 1)).toThrow(/could not sample/);
  });

  it("starts each person at a meeting candidate and sends them home to a town point", () => {
    for (const p of groups.flatMap((g) => g.people)) {
      expect("station" in p.start && real.byId.get(p.start.station)! < real.nCandidates).toBe(true);
      expect(p.home !== undefined && "lat" in p.home).toBe(true);
    }
  });
});

describe("alphaSweep", () => {
  const rows = alphaSweep(real, groups, [0, 0.5, 1], 5);

  it("costs nothing on the average at α = 1 and nothing on the worst case at α = 0", () => {
    expect(rows[2]!.avgExtra).toBe(0);
    expect(rows[0]!.worstExtra).toBe(0);
  });

  it("trades the two measures as α moves", () => {
    expect(rows[0]!.avgExtra).toBeGreaterThanOrEqual(rows[1]!.avgExtra);
    expect(rows[2]!.worstExtra).toBeGreaterThanOrEqual(rows[1]!.worstExtra);
    expect(rows[1]!.sameAs).toBe(1);
  });
});

describe("lambdaSweep", () => {
  it("compares each penalty with the default, by the minutes and transfers of the winner", () => {
    const rows = lambdaSweep(real, groups, [0, 5, 15], 0.5);
    expect(rows[1]!.sameAs).toBe(1);
    expect(rows[2]!.transfers).toBeLessThanOrEqual(rows[0]!.transfers);
    expect(rows[2]!.minutes).toBeGreaterThanOrEqual(rows[0]!.minutes);
  });
});
