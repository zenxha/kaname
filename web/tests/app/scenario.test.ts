import { describe, expect, it } from "vitest";
import { addPerson, DEFAULT_PEOPLE, isExample, removePerson, toParticipants, updatePerson, type Person } from "../../src/model/scenario";
import { alphaNote, STRINGS, t } from "../../src/model/i18n";
import { rank } from "../../core/rank";
import { real } from "../realData";

describe("scenario state", () => {
  it("adds, updates and removes people without mutating the old state", () => {
    const before = Object.freeze([...DEFAULT_PEOPLE]) as readonly Person[];
    const added = addPerson(before, "Emi");
    expect(added).toHaveLength(before.length + 1);
    expect(before).toHaveLength(DEFAULT_PEOPLE.length);
    const last = added.at(-1)!;
    expect(new Set(added.map((p) => p.id)).size).toBe(added.length);
    const renamed = updatePerson(added, last.id, { label: "Emi K" });
    expect(renamed.at(-1)!.label).toBe("Emi K");
    expect(added.at(-1)!.label).toBe("Emi");
    expect(removePerson(renamed, last.id)).toHaveLength(before.length);
  });

  it("turns people into engine participants; an empty home means home = start; empty places are skipped", () => {
    const people: Person[] = [
      { id: "a", label: "A", start: { station: "shinjuku" }, home: null },
      { id: "b", label: "B", start: { station: "tokyo" }, home: { station: "chiba" } },
      { id: "c", label: "C", start: null, home: null },
    ];
    expect(toParticipants(people)).toEqual([
      { label: "A", start: { station: "shinjuku" } },
      { label: "B", start: { station: "tokyo" }, home: { station: "chiba" } },
    ]);
  });

  it("names an unnamed person by their number, in the caller's words", () => {
    const people: Person[] = [
      { id: "a", label: " ", start: { station: "shinjuku" }, home: null },
      { id: "b", label: "", start: { station: "tokyo" }, home: null },
    ];
    expect(toParticipants(people).map((p) => p.label)).toEqual(["#1", "#2"]);
    expect(toParticipants(people, (n) => `Person ${n}`).map((p) => p.label)).toEqual(["Person 1", "Person 2"]);
  });

  it("opens on Shizuku and Tora, who meet at 神保町", () => {
    const r = rank(toParticipants(DEFAULT_PEOPLE), {}, real);
    expect(r.candidates.length).toBe(10);
    expect(r.candidates[0]!.station.ja).toBe("神保町");
    expect(isExample(DEFAULT_PEOPLE)).toBe(true);
    expect(isExample(updatePerson(DEFAULT_PEOPLE, "p1", { label: "Mei" }))).toBe(false);
  });
});

describe("strings", () => {
  it("has every string in both languages", () => {
    expect(Object.keys(STRINGS.ja).sort()).toEqual(Object.keys(STRINGS.en).sort());
    expect(t("en", "meetAt")).toBe("Meet at");
    expect(t("ja", "people", { n: 4 })).toContain("4");
  });

  it("uses no letter-spaced capitals: every English label is sentence case", () => {
    const shouting = Object.entries(STRINGS.en).filter(([, v]) => /\b[A-Z]{3,}\b/.test(v.replace(/MLIT|MIT|BY/g, "")));
    expect(shouting).toEqual([]);
  });

  it("explains the slider position in words", () => {
    expect(alphaNote(1)).toBe("noteEfficient");
    expect(alphaNote(0.5)).toBe("noteBalanced");
    expect(alphaNote(0)).toBe("noteFair");
  });
});
