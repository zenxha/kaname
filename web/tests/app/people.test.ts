/** The group limits and the messages for a group the engine cannot plan. */
import { describe, expect, it } from "vitest";
import { RankError } from "../../core/errors";
import { MAX_PARTICIPANTS } from "../../core/participants";
import { rank } from "../../core/rank";
import { DEFAULT_WINDOWS } from "../../core/data";
import { problemText } from "../../src/model/problem";
import { addPerson, canAddPerson, toParticipants, type Person } from "../../src/model/scenario";
import { real } from "../realData";

const person = (id: string, label: string, station: string | null, home: string | null = null): Person => ({
  id, label, start: station === null ? null : { station }, home: home === null ? null : { station: home },
});

function rankError(fn: () => unknown): RankError {
  try {
    fn();
  } catch (e) {
    if (e instanceof RankError) return e;
    throw e;
  }
  throw new Error("expected a RankError");
}

describe("the people limit", () => {
  it("allows a new person only below the engine's limit", () => {
    let people: readonly Person[] = [];
    while (canAddPerson(people)) people = addPerson(people, "");
    expect(people).toHaveLength(MAX_PARTICIPANTS);
    expect(canAddPerson(people.slice(1))).toBe(true);
  });
});

describe("people with the same name", () => {
  it("get their list number, so the engine sees different labels", () => {
    const people = [person("p1", "Aki", "tokyo"), person("p2", "Ben", "shinjuku"), person("p3", " Aki ", "chiba")];
    expect(toParticipants(people).map((p) => p.label)).toEqual(["Aki", "Ben", "Aki (3)"]);
    expect(() => rank(toParticipants(people), {}, real)).not.toThrow();
  });

  it("stay within the engine's label limit, even for long names in emoji", () => {
    const long = "🚃".repeat(40);
    const people = [person("p1", long, "tokyo"), person("p2", long, "shinjuku")];
    expect(() => rank(toParticipants(people), {}, real)).not.toThrow();
  });

  it("treat a name of only invisible characters as no name", () => {
    const people = [person("p1", "\u200b", "tokyo"), person("p2", "Ben", "shinjuku")];
    expect(toParticipants(people, (n) => `Person ${n}`)[0]!.label).toBe("Person 1");
  });

  it("stay different when a name looks like the label of an unnamed person", () => {
    const people = [person("p1", "Person 2", "tokyo"), person("p2", "", "shinjuku"), person("p3", "Person 2 (3)", "chiba"), person("p4", "Person 2", "omiya")];
    const labels = toParticipants(people, (n) => `Person ${n}`).map((p) => p.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("a group the engine cannot plan", () => {
  it("names the person and the place in the error", () => {
    const home = rankError(() => rank(toParticipants([person("p1", "Aki", "tokyo", "kazusa-kameyama"), person("p2", "Ben", "shinjuku")]), {}, real));
    expect(home).toMatchObject({ code: "UNROUTABLE_STATION", participant: "Aki", place: "home" });
    const far = rankError(() => rank([{ label: "Aki", start: { station: "tokyo" } }, { label: "Ben", start: { lat: 34.69, lng: 135.5 } }], {}, real));
    expect(far).toMatchObject({ code: "LOCATION_TOO_FAR", participant: "Ben", place: "start" });
  });

  it("explains the problem in the reader's language, with the person's name", () => {
    const home = new RankError("UNROUTABLE_STATION", "x", { participant: "Aki", place: "home" });
    expect(problemText("en", home, DEFAULT_WINDOWS)).toContain("Aki");
    expect(problemText("en", home, DEFAULT_WINDOWS)).toContain("21:00");
    expect(problemText("en", home, { ...DEFAULT_WINDOWS, home: ["20:00", "22:30"] })).toContain("22:30");
    expect(problemText("ja", home, DEFAULT_WINDOWS)).toContain("Aki");
    expect(problemText("ja", home, DEFAULT_WINDOWS)).not.toBe(problemText("en", home, DEFAULT_WINDOWS));
    const far = new RankError("LOCATION_TOO_FAR", "x", { participant: "Ben", place: "start" });
    expect(problemText("en", far, DEFAULT_WINDOWS)).toMatch(/Ben.*2 km/);
    expect(problemText("en", far, DEFAULT_WINDOWS)).not.toBe(problemText("en", home, DEFAULT_WINDOWS));
  });

  it("falls back to a general message, never the engine's English, in either language", () => {
    const other = new RankError("BAD_OPTION", "no route for station 5");
    expect(problemText("en", other, DEFAULT_WINDOWS)).not.toContain("no route");
    expect(problemText("ja", other, DEFAULT_WINDOWS)).not.toContain("no route");
    expect(problemText("ja", other, DEFAULT_WINDOWS)).not.toBe(problemText("en", other, DEFAULT_WINDOWS));
  });
});
