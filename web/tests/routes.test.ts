import { describe, expect, it } from "vitest";
import { RankError } from "../core/errors";
import { routeFor } from "../core/routes";
import { findStation } from "../core/stations";
import { real, realRoutes } from "./realData";

const routes = realRoutes();
const railway = (i: number) => real.railways[i]!.id;

describe("routeFor on the real data", () => {
  it("新宿 -> 東京 outbound is one Chuo Rapid ride", () => {
    const tokyo = findStation(real, "東京");
    const hops = routeFor(routes, "out", tokyo, findStation(real, "新宿"));
    expect(hops).toHaveLength(1);
    expect(railway(hops[0]!.railway)).toBe("JR-East.ChuoRapid");
    expect(hops[0]!.to).toBe(tokyo);
  });

  it("every outbound route of one block starts at its station and ends at the candidate", () => {
    const k = findStation(real, "渋谷");
    for (let s = 0; s < real.nStations; s += 37) {
      const hops = routeFor(routes, "out", k, s);
      if (s === k) {
        expect(hops).toEqual([]);
        continue;
      }
      expect(hops[0]!.from).toBe(s);
      expect(hops.at(-1)!.to).toBe(k);
      hops.slice(1).forEach((h, i) => expect(h.walk || h.from === hops[i]!.to).toBe(true));
    }
  });

  it("home routes start at the candidate", () => {
    const k = findStation(real, "池袋");
    const hops = routeFor(routes, "home", k, findStation(real, "川越"));
    expect(hops[0]!.from).toBe(k);
    expect(real.stations[hops.at(-1)!.to]!.ja).toBe("川越");
  });

  it("rejects indexes out of range", () => {
    expect(() => routeFor(routes, "out", real.nCandidates, 0)).toThrow(RankError);
    expect(() => routeFor(routes, "home", 0, real.nStations)).toThrow(RankError);
  });
});
