import { describe, expect, it } from "vitest";
import { fold, parseKana, searchStations } from "../../src/model/search";
import { real, realKana } from "../realData";

const ids = (q: string, n = 5) => searchStations(real, q, n, realKana).map((s) => s.id);

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

  it("finds by kana while it is still being typed, in hiragana or katakana", () => {
    expect(ids("しばまた")[0]).toBe("shibamata");
    expect(ids("しばま")[0]).toBe("shibamata");
    expect(ids("シバマタ")[0]).toBe("shibamata");
    expect(ids("せいせきさく")[0]).toBe("seiseki-sakuragaoka");
    expect(ids("こうじまち")[0]).toBe("kojimachi"); // 麴町, matched through a variant kanji
    expect(ids("みのわばし")[0]).toBe("minowabashi"); // a Toden Arakawa Line stop
    expect(searchStations(real, "しばまた", 5).map((s) => s.id)).not.toContain("shibamata"); // no kana, no match
  });

  it("folds katakana to hiragana so names written either way meet", () => {
    expect(fold("ゲートウェイ")).toBe(fold("げーとうぇい"));
    expect(fold("霞ヶ関")).toBe(fold("霞ケ関"));
  });
});

describe("parseKana", () => {
  it("keeps readings of known stations and drops the rest", () => {
    const kana = parseKana({ kana: { shibamata: ["しばまた"], atlantis: ["あとらんてぃす"], tokyo: [7] } }, real);
    expect(kana.get(real.byId.get("shibamata")!)).toEqual(["しばまた"]);
    expect(kana.size).toBe(1);
  });

  it("is empty for a missing or malformed file", () => {
    expect(parseKana(null, real).size).toBe(0);
    expect(parseKana({ kana: "x" }, real).size).toBe(0);
  });
});
