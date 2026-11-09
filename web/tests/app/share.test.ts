/** The shareable link: the plan as stations, names and settings in the query string; never a location. */
import { describe, expect, it } from "vitest";
import { MAX_PARTICIPANTS } from "../../core/participants";
import { decodePlan, encodePlan, peopleOf, planOf, type Plan } from "../../src/model/share";
import type { Person } from "../../src/model/scenario";
import { real } from "../realData";

const isStation = (id: string) => real.byId.has(id);
const PLAN: Plan = {
  people: [
    { start: "seiseki-sakuragaoka", home: null, name: "Shizuku" },
    { start: "shibamata", home: null, name: "" },
    { start: "kanazawa-hakkei", home: "yokohama", name: "ひとり_2" },
  ],
  alpha: 0.25,
  at: "tokyo",
};

describe("encodePlan", () => {
  it("writes each person as station, then _ and their name if they have one", () => {
    expect(encodePlan(PLAN, new URLSearchParams())).toBe(
      "?p=seiseki-sakuragaoka_Shizuku&p=shibamata&p=kanazawa-hakkei.yokohama_%E3%81%B2%E3%81%A8%E3%82%8A_2&fair=75&at=tokyo");
  });

  it("leaves out defaults and keeps parameters that are not part of the plan", () => {
    const plain: Plan = { people: PLAN.people.slice(0, 2), alpha: 0.5, at: null };
    expect(encodePlan(plain, new URLSearchParams("basemap=none&at=old"))).toBe("?basemap=none&p=seiseki-sakuragaoka_Shizuku&p=shibamata");
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
    expect(d.plan!.people).toEqual([{ start: "shibamata", home: null, name: "" }, { start: "tokyo", home: null, name: "" }]);
    expect(d.plan!.at).toBeNull();
  });

  it("reads a name after the first _, trimmed, without control characters, and capped", () => {
    const people = decodePlan(`?p=tokyo_%20Aki%0A%20&p=ueno_${"x".repeat(60)}&p=shibamata_`, isStation).plan!.people;
    expect(people.map((p) => p.name)).toEqual(["Aki", "x".repeat(40), ""]);
  });

  it("ignores settings out of range and keeps the defaults", () => {
    expect(decodePlan("?p=tokyo&p=ueno&fair=150", isStation).plan!.alpha).toBe(0.5);
    expect(decodePlan("?p=tokyo&p=ueno&fair=abc", isStation).plan!.alpha).toBe(0.5);
  });

  it("ignores a meeting end from an older link: the app proposes the end itself", () => {
    expect(decodePlan("?p=tokyo&p=ueno&end=2330", isStation).plan).toEqual({
      people: [{ start: "tokyo", home: null, name: "" }, { start: "ueno", home: null, name: "" }], alpha: 0.5, at: null });
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

  it("keeps stations and names; a location becomes the station it snapped to and never travels itself", () => {
    const plan = planOf(people, (i) => (i === 1 ? "tokyo" : null), 0.5, null);
    expect(plan.people).toEqual([
      { start: "shinjuku", home: null, name: "Aki" },
      { start: "tokyo", home: null, name: "Ben" },
      { start: "ueno", home: "omiya", name: "Dai" },
    ]);
    expect(encodePlan(plan, new URLSearchParams())).not.toMatch(/35\.68|139\.76/);
  });

  it("sends an address home as the station it snapped to, and never its text", () => {
    const withAddress: Person[] = [
      { id: "p1", label: "Eri", start: { station: "shinjuku" }, home: { lat: 35.663, lng: 139.700, address: "東京都渋谷区神南一丁目" } },
    ];
    const plan = planOf(withAddress, (i, which) => (which === "home" ? "shibuya" : null), 0.5, null);
    expect(plan.people).toEqual([{ start: "shinjuku", home: "shibuya", name: "Eri" }]);
    expect(encodePlan(plan, new URLSearchParams())).not.toMatch(/神南|%E7%A5%9E/);
  });

  it("skips a location that has not snapped yet", () => {
    expect(planOf(people, () => null, 0.5, null).people).toHaveLength(2);
  });

  it("turns a plan back into people with their names", () => {
    expect(peopleOf(PLAN)).toEqual([
      { id: "p1", label: "Shizuku", start: { station: "seiseki-sakuragaoka" }, home: null },
      { id: "p2", label: "", start: { station: "shibamata" }, home: null },
      { id: "p3", label: "ひとり_2", start: { station: "kanazawa-hakkei" }, home: { station: "yokohama" } },
    ]);
  });
});
