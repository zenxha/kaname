/** Address search over the MLIT town and 丁目 index, on the device. */
import { describe, expect, it } from "vitest";
import { addressKey, looksLikeAddress, parseAddresses, searchAddresses } from "../../src/model/address";
import { realAddresses } from "../realData";

const index = realAddresses();
const top = (q: string, n = 4) => searchAddresses(index, q, n).map((t) => `${t.city}${t.name}`);

describe("addressKey", () => {
  it("turns full-width digits and kanji 丁目 numbers into plain digits", () => {
    expect(addressKey("東京都渋谷区神南一丁目")).toBe("東京都渋谷区神南1丁目");
    expect(addressKey("神南１丁目")).toBe("神南1丁目");
    expect(addressKey("銀座十二丁目")).toBe("銀座12丁目");
    expect(addressKey("霞ヶ関 二丁目")).toBe("霞ケ関2丁目");
  });
});

describe("searchAddresses", () => {
  it("finds a 丁目 from the way people write a street address", () => {
    expect(top("渋谷区神南1-2-3")[0]).toBe("東京都渋谷区神南一丁目");
    expect(top("神南1丁目5番")[0]).toBe("東京都渋谷区神南一丁目");
    expect(top("東京都渋谷区神南二丁目")[0]).toBe("東京都渋谷区神南二丁目");
  });

  it("lists the towns of a name, and names its city", () => {
    const hits = searchAddresses(index, "神南", 4);
    expect(hits.map((t) => t.name)).toEqual(["神南一丁目", "神南二丁目"]);
    expect(hits[0]!.at[0]).toBeCloseTo(139.700363, 4);
  });

  it("puts a town that starts with the query before one that only contains it", () => {
    expect(top("中町")[0]).toMatch(/中町/);
    expect(searchAddresses(index, "中町", 10).every((t) => t.name.includes("中町"))).toBe(true);
  });

  it("does not search Latin text or a single character", () => {
    expect(looksLikeAddress("shibuya")).toBe(false);
    expect(looksLikeAddress("神")).toBe(false);
    expect(looksLikeAddress("神南")).toBe(true);
    expect(searchAddresses(index, "1", 4)).toEqual([]);
  });
});

describe("parseAddresses", () => {
  it("reads the compact file and rejects a malformed one", () => {
    const parsed = parseAddresses({ cities: [["東京都渋谷区", [["神南一丁目", 13970036, 3566313]]]] });
    expect(parsed.towns[0]).toMatchObject({ city: "東京都渋谷区", name: "神南一丁目", at: [139.70036, 35.66313] });
    expect(() => parseAddresses({ cities: [["x", [["y", "a", 1]]]] })).toThrow(/address/);
    expect(() => parseAddresses(null)).toThrow(/address/);
  });
});
