import { describe, expect, it } from "vitest";
import { addPerson, DEFAULT_PEOPLE, removePerson, toParticipants, updatePerson, type Person } from "../../src/model/scenario";
import { personColor, PERSON_COLORS } from "../../src/model/palette";
import { STRINGS, t } from "../../src/model/i18n";
import { personSummary, spareMinutes, TIGHT_MIN } from "../../src/model/summary";
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

  it("the default group ranks on the real data", () => {
    const r = rank(toParticipants(DEFAULT_PEOPLE), {}, real);
    expect(r.candidates.length).toBe(10);
  });
});

describe("palette and strings", () => {
  it("gives 20 distinct person colors and repeats after that", () => {
    expect(new Set(PERSON_COLORS).size).toBe(20);
    expect(personColor(0)).toBe(personColor(20));
  });

  it("has every string in both languages", () => {
    expect(Object.keys(STRINGS.ja).sort()).toEqual(Object.keys(STRINGS.en).sort());
    expect(t("en", "meetAt")).toBe("MEET AT");
    expect(t("ja", "people", { n: 4 })).toContain("4");
  });
});

describe("person summary", () => {
  const r = rank(toParticipants(DEFAULT_PEOPLE), { meetingEnd: 23 * 60 }, real);
  const best = r.candidates[0]!;

  it("computes spare minutes before the last train and flags tight ones", () => {
    expect(spareMinutes(1400, 23 * 60)).toBe(20);
    expect(spareMinutes(null, 23 * 60)).toBeNull();
    expect(spareMinutes(1400, null)).toBeNull();
    const s = personSummary(best.people[0]!, 23 * 60);
    expect(s.total).toBe(best.people[0]!.outMinutes + best.people[0]!.homeMinutes);
    expect(s.tight).toBe(s.spare !== null && s.spare < TIGHT_MIN);
  });
});
