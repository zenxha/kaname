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
    expect(addressKey("十丁目")).toBe("10丁目");
    expect(addressKey("九十九丁目")).toBe("99丁目");
    expect(addressKey("一二丁目")).toBe("一二丁目"); // not a number shape: left alone
  });

  it("treats ヶ, ケ and が the same, as place names are written all three ways", () => {
    expect(addressKey("霞ヶ関")).toBe(addressKey("霞が関"));
    expect(addressKey("自由ヶ丘")).toBe(addressKey("自由が丘"));
  });
});

describe("searchAddresses", () => {
  it("lists the match nearest central Tokyo first when two towns share a name", () => {
    // 西新宿二丁目 is in 新宿区 and in 蓮田市 (埼玉県); the names alone sort 埼玉 first.
    expect(top("西新宿2", 2)).toEqual(["東京都新宿区西新宿二丁目", "埼玉県蓮田市西新宿二丁目"]);
  });

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

  it("puts a town that starts with the query first, even when its city has the same name", () => {
    expect(top("渋谷")[0]).toBe("東京都渋谷区渋谷一丁目");
    expect(top("渋谷", 4).every((t) => t.startsWith("東京都渋谷区渋谷"))).toBe(true);
  });

  it("finds 霞が関 when typed with ヶ", () => {
    expect(top("霞ヶ関1丁目")[0]).toBe("東京都千代田区霞が関一丁目");
  });

  it("falls back to the town when the number is a 番地, not a 丁目", () => {
    expect(top("町田市小野路町1234")[0]).toBe("東京都町田市小野路町");
  });

  it("stays fast and empty on very long input", () => {
    const t0 = performance.now();
    expect(searchAddresses(index, "1".repeat(100_000), 4)).toEqual([]);
    expect(searchAddresses(index, `${"神".repeat(50_000)}1`, 4)).toEqual([]);
    expect(performance.now() - t0).toBeLessThan(500);
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
