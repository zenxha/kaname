/** The shareable link: the plan as station ids and settings in the query string, and nothing personal. */
import { describe, expect, it } from "vitest";
import { MAX_PARTICIPANTS } from "../../core/participants";
import { decodePlan, encodePlan, peopleOf, planOf, type Plan } from "../../src/model/share";
import type { Person } from "../../src/model/scenario";
import { real } from "../realData";

const isStation = (id: string) => real.byId.has(id);
const PLAN: Plan = {
  people: [
    { start: "seiseki-sakuragaoka", home: null },
    { start: "shibamata", home: null },
    { start: "kanazawa-hakkei", home: "yokohama" },
  ],
  alpha: 0.25,
  at: "tokyo",
};

describe("encodePlan", () => {
  it("writes station ids and settings, readable and with nothing escaped", () => {
    expect(encodePlan(PLAN, new URLSearchParams())).toBe(
      "?p=seiseki-sakuragaoka&p=shibamata&p=kanazawa-hakkei.yokohama&fair=75&at=tokyo");
  });

  it("leaves out defaults and keeps parameters that are not part of the plan", () => {
    const plain: Plan = { people: PLAN.people.slice(0, 2), alpha: 0.5, at: null };
    expect(encodePlan(plain, new URLSearchParams("basemap=none&at=old"))).toBe("?basemap=none&p=seiseki-sakuragaoka&p=shibamata");
  });
});

describe("decodePlan", () => {
  it("reads back what encodePlan wrote", () => {
    expect(decodePlan(encodePlan(PLAN, new URLSearchParams()), isStation)).toEqual({ plan: PLAN, unknown: 0 });
  });

  it("is null without people, so the app opens on its example", () => {
    expect(decodePlan("", isStation)).toEqual({ plan: null, unknown: 0 });
    expect(decodePlan("?basemap=none&fair=10", isStation)).toEqual({ plan: null, unknown: 0 });
  });

  it("drops stations it does not know and counts them; a bad home falls back to the start", () => {
    const d = decodePlan("?p=atlantis&p=shibamata&p=tokyo.nowhere&at=atlantis", isStation);
    expect(d.unknown).toBe(3);
    expect(d.plan!.people).toEqual([{ start: "shibamata", home: null }, { start: "tokyo", home: null }]);
    expect(d.plan!.at).toBeNull();
  });

  it("ignores settings out of range and keeps the defaults", () => {
    expect(decodePlan("?p=tokyo&p=ueno&fair=150", isStation).plan!.alpha).toBe(0.5);
    expect(decodePlan("?p=tokyo&p=ueno&fair=abc", isStation).plan!.alpha).toBe(0.5);
  });

  it("ignores a meeting end from an older link: the app proposes the end itself", () => {
    expect(decodePlan("?p=tokyo&p=ueno&end=2330", isStation).plan).toEqual({
      people: [{ start: "tokyo", home: null }, { start: "ueno", home: null }], alpha: 0.5, at: null });
  });

  it("reads at most as many people as the engine takes", () => {
    const many = Array.from({ length: MAX_PARTICIPANTS + 5 }, () => "p=tokyo").join("&");
    expect(decodePlan(`?${many}`, isStation).plan!.people).toHaveLength(MAX_PARTICIPANTS);
  });
});

describe("planOf and peopleOf", () => {
  const people: Person[] = [
    { id: "p1", label: "Aki", start: { station: "shinjuku" }, home: { station: "shinjuku" } },
    { id: "p2", label: "Ben", start: { lat: 35.68, lng: 139.76 }, home: null },
    { id: "p3", label: "Chie", start: null, home: null },
    { id: "p4", label: "Dai", start: { station: "ueno" }, home: { station: "omiya" } },
  ];

  it("keeps stations only: no names, and a location becomes the station it snapped to", () => {
    const plan = planOf(people, (i) => (i === 1 ? "tokyo" : null), 0.5, null);
    expect(plan.people).toEqual([
      { start: "shinjuku", home: null },
      { start: "tokyo", home: null },
      { start: "ueno", home: "omiya" },
    ]);
    expect(JSON.stringify(plan)).not.toMatch(/Aki|Ben|Dai|35\.68/);
  });

  it("skips a location that has not snapped yet", () => {
    expect(planOf(people, () => null, 0.5, null).people).toHaveLength(2);
  });

  it("turns a plan back into unnamed people", () => {
    expect(peopleOf(PLAN)).toEqual([
      { id: "p1", label: "", start: { station: "seiseki-sakuragaoka" }, home: null },
      { id: "p2", label: "", start: { station: "shibamata" }, home: null },
      { id: "p3", label: "", start: { station: "kanazawa-hakkei" }, home: { station: "yokohama" } },
    ]);
  });
});
