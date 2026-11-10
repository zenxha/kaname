/** The link preview picture of a plan, as SVG: who meets where, and each person's trains on the map. */
import { describe, expect, it } from "vitest";
import { cardPeople, planCardSvg, stationFontSize, textWidth } from "../../preview/card";
import { answerFor } from "../../preview/plan";
import { real, realRoutes, realShapes } from "../realData";
import { routeFor } from "../../core/routes";

const routes = realRoutes();
const shapes = realShapes();
const card = (search: string, people = (best: NonNullable<ReturnType<typeof answerFor>>) =>
  cardPeople(real, best, (station) => routeFor(routes, "out", real.byId.get(best.station.id)!, station), shapes)) => {
  const best = answerFor(real, search)!;
  return planCardSvg({ data: real, best, people: people(best) });
};

describe("planCardSvg", () => {
  it("is a 1200 by 630 picture with the station, the people and their routes", () => {
    const svg = card("?p=seiseki-sakuragaoka_Shizuku&p=shibamata_Tora");
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="1200" height="630"/);
    expect(svg).toContain(">神田<");
    expect(svg).toContain("Shizuku and Tora meet at");
    expect(svg).toContain("93 min on average");
    expect(svg.match(/class="badge"/g)).toHaveLength(2);
    expect(svg).toContain('stroke="#DD0077"'); // Shizuku's Keio Line, in its own color
  });

  it("escapes names, so a name cannot break the picture", () => {
    const svg = card("?p=seiseki-sakuragaoka_%3Cscript%3E%26&p=shibamata_Tora");
    expect(svg).toContain("&lt;script&gt;&amp;");
    expect(svg).not.toContain("<script>");
  });

  it("shrinks a long station name to fit the left half", () => {
    expect(stationFontSize("神田")).toBe(132);
    const long = "羽田空港第3ターミナル";
    expect(stationFontSize(long)).toBeLessThan(132);
    expect(stationFontSize(long) * textWidth(long)).toBeLessThanOrEqual(560);
  });
});

describe("textWidth", () => {
  it("counts a Japanese character as one em and Latin letters as about half", () => {
    expect(textWidth("神田")).toBe(2);
    expect(textWidth("Kanda")).toBeGreaterThan(2);
    expect(textWidth("Kanda")).toBeLessThan(4);
  });
});
