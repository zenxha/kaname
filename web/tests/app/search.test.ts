import { describe, expect, it } from "vitest";
import { searchStations } from "../../src/model/search";
import { real } from "../realData";

const ids = (q: string, n = 5) => searchStations(real, q, n).map((s) => s.id);

describe("searchStations", () => {
  it("finds by Japanese and English prefix, ignoring case, macrons, spaces and hyphens", () => {
    expect(ids("吉祥")[0]).toBe("kichijoji");
    expect(ids("kichi")[0]).toBe("kichijoji");
    expect(ids("Kichijōji")[0]).toBe("kichijoji");
    expect(ids("musashikosugi")[0]).toBe("musashi-kosugi");
    expect(ids("SHINJUKU")[0]).toBe("shinjuku");
  });

  it("ranks an exact name first, then busier stations", () => {
    const r = ids("新宿", 10);
    expect(r[0]).toBe("shinjuku");
    expect(r).toContain("shinjuku-sanchome");
  });

  it("finds a substring when nothing starts with it, and returns nothing for blank input", () => {
    expect(ids("sanchome", 20)).toContain("shinjuku-sanchome");
    expect(ids("  ")).toEqual([]);
    expect(ids("zzzz")).toEqual([]);
  });

  it("respects the limit", () => {
    expect(searchStations(real, "s", 3)).toHaveLength(3);
  });
});
