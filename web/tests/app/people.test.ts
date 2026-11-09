/** The group limits and the messages for a group the engine cannot plan. */
import { describe, expect, it } from "vitest";
import { RankError } from "../../core/errors";
import { MAX_PARTICIPANTS } from "../../core/participants";
import { rank } from "../../core/rank";
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
    expect(problemText("en", home)).toContain("Aki");
    expect(problemText("ja", home)).toContain("Aki");
    expect(problemText("ja", home)).not.toBe(problemText("en", home));
    const far = new RankError("LOCATION_TOO_FAR", "x", { participant: "Ben", place: "start" });
    expect(problemText("en", far)).toMatch(/Ben/);
    expect(problemText("en", far)).not.toBe(problemText("en", home));
  });

  it("falls back to a general message with the engine's detail", () => {
    const other = new RankError("BAD_OPTION", "no route for station 5");
    expect(problemText("en", other)).toContain("no route for station 5");
    expect(problemText("ja", other)).toContain("no route for station 5");
  });
});
