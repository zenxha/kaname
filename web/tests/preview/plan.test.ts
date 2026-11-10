/** A shared plan link, read on the server the way the app reads it, and the words of its link preview. */
import { describe, expect, it } from "vitest";
import { answerFor, namesText, planQuery, previewText } from "../../preview/plan";
import { real } from "../realData";

const EXAMPLE = "?p=seiseki-sakuragaoka_Shizuku&p=shibamata_Tora";

describe("answerFor", () => {
  it("finds the station the app shows for the same link", () => {
    expect(answerFor(real, EXAMPLE)?.station.ja).toBe("神田");
    expect(answerFor(real, `${EXAMPLE}&at=nippori`)?.station.ja).toBe("日暮里"); // a station picked by hand
    expect(answerFor(real, `${EXAMPLE}&at=nowhere`)?.station.ja).toBe("神田");
  });

  it("names a person without a name the way the app does in English", () => {
    expect(answerFor(real, "?p=seiseki-sakuragaoka&p=shibamata_Tora")?.people.map((p) => p.label)).toEqual(["Person 1", "Tora"]);
  });

  it("is null for a link that has no plan the app can rank", () => {
    expect(answerFor(real, "")).toBeNull();
    expect(answerFor(real, "?p=shibamata_Tora")).toBeNull(); // one person
    expect(answerFor(real, "?p=nowhere_A&p=elsewhere_B")).toBeNull(); // no known station
  });
});

describe("namesText", () => {
  it("lists up to three names and counts the rest", () => {
    expect(namesText(["Shizuku", "Tora"])).toBe("Shizuku and Tora");
    expect(namesText(["Shizuku", "Tora", "Kai"])).toBe("Shizuku, Tora and Kai");
    expect(namesText(["A", "B", "C", "D", "E"])).toBe("A, B, C and 2 more");
    expect(namesText(["A", "B", "C", "D"])).toBe("A, B, C and 1 more");
  });
});

describe("previewText", () => {
  it("says who meets where, the numbers on the ticket, and when everyone has to leave", () => {
    const text = previewText(answerFor(real, EXAMPLE)!);
    expect(text.title).toBe("Shizuku and Tora meet at 神田 (Kanda)");
    expect(text.description).toBe("93 min on average. Tora's trip is the hardest: 85 min with 4 changes. "
      + "Everyone can stay until 23:32, Tora's last train home.");
    expect(text.alt).toContain("神田");
  });
});

describe("planQuery", () => {
  it("rebuilds the plan from what the app reads, so a link has one picture address however it is written", () => {
    expect(planQuery(real, "?utm_source=x&at=nippori&p=shibamata_A&fair=030&p=kanda_B&basemap=none")).toBe("?p=shibamata_A&p=kanda_B&fair=30&at=nippori");
    expect(planQuery(real, "?p=shibamata_A&p=nowhere_X&p=kanda_B&fair=50")).toBe("?p=shibamata_A&p=kanda_B"); // 50 is the default
    expect(planQuery(real, "?p=nowhere_X")).toBe("");
  });

  it("keeps no more people than the app reads", () => {
    const many = Array.from({ length: 80 }, (_, i) => `p=kanda_P${i}`).join("&");
    expect(new URLSearchParams(planQuery(real, `?${many}`)).getAll("p")).toHaveLength(50);
  });
});
