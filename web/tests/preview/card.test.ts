/** The link preview picture of a plan, as SVG: who meets where, and each person's trains on the map. */
import { describe, expect, it } from "vitest";
import { bandColor, cardPeople, COLORS, escapeXml, meetProjection, MIDDLE, planCardSvg, SIGN, stationFontSize, textOn, textWidth, type CardPerson } from "../../preview/card";
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
    const svg = card("?p=seiseki-sakuragaoka_Shizuku~shibamata_Tora");
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="1200" height="630"/);
    expect(svg).toContain(">神田<");
    expect(svg).toContain("Shizuku and Tora meet at");
    expect(svg).toMatch(/93 min on average · hardest trip \d+ min \((Shizuku|Tora)\)/);
    expect(svg.match(/class="badge"/g)).toHaveLength(2);
    expect(svg).toContain('stroke="#DD0077"'); // Shizuku's Keio Line, in its own color
  });

  it("keeps the sign and its seal inside the middle square, which Instagram keeps when it crops", () => {
    expect(SIGN.x0).toBeGreaterThanOrEqual(MIDDLE.x0);
    expect(SIGN.x0 + SIGN.w + 32).toBeLessThanOrEqual(MIDDLE.x1); // the seal sticks out 32 px at most
    expect(MIDDLE.x1 - MIDDLE.x0).toBe(630);
  });

  it("escapes names, so a name cannot break the picture", () => {
    const svg = card("?p=seiseki-sakuragaoka_%3Cscript%3E%26~shibamata_Tora");
    expect(svg).toContain("&lt;script&gt;&amp;");
    expect(svg).not.toContain("<script>");
  });

  it("leaves out characters that SVG cannot hold, so such a name still gets its picture", () => {
    expect(escapeXml("a\uFFFEb\u0001c\uD800d\uFFFFe")).toBe("abcde");
    expect(escapeXml("神田 😀 &")).toBe("神田 😀 &amp;");
  });

  it("shortens a long name on the band, so the line stays on the sign", () => {
    const long = "長".repeat(40);
    const svg = card(`?p=kunitachi_${long}~hamamatsucho_B`);
    expect(svg).not.toContain(long);
    const [, size, line] = /class="band"[^>]* font-size="(\d+)"[^>]*>([^<]*)</.exec(svg)!;
    expect(line).toContain("…");
    expect(Number(size) * textWidth(line!)).toBeLessThanOrEqual(SIGN.w - 50);
  });

  it("shrinks a long station name to fit the sign", () => {
    expect(stationFontSize("神田")).toBe(112);
    const long = "羽田空港第3ターミナル";
    expect(stationFontSize(long)).toBeLessThan(112);
    expect(stationFontSize(long) * textWidth(long)).toBeLessThanOrEqual(SIGN.w - 100);
  });

  it("lets the sign cover a person who starts at the station, and draws the others over it", () => {
    const svg = card("?p=shibuya_Aki~ebisu_Ben~shinjuku_Chie");
    expect(svg).toContain(">渋谷<");
    const sign = svg.indexOf('class="sign"');
    expect(svg.indexOf(">Aki <")).toBeLessThan(sign); // Aki starts at 渋谷, under the sign
    expect(svg.indexOf(">Chie <")).toBeGreaterThan(sign);
  });
});

describe("meetProjection", () => {
  const box = { x0: 50, y0: 74, x1: 1150, y1: 556 };
  const area = { x0: 420, y0: 260, x1: 780, y1: 340 };
  const groups = {
    "along one line from the west": "?p=hachioji_A~tachikawa_B~kokubunji_C~mitaka_D",
    "north to south": "?p=omiya_A~kamakura_B",
    "a ring": "?p=ikebukuro_A~shinjuku_B~shibuya_C~shinagawa_D~tokyo_E~ueno_F",
    "one far outlier": "?p=shibuya_A~ebisu_B~meguro_C~gotanda_D~narita_E",
    "one station": "?p=shibuya_A~shibuya_B",
  };
  it.each(Object.entries(groups))("keeps the meeting point under the sign and every start on the card: %s", (_, search) => {
    const best = answerFor(real, search)!;
    const k = real.byId.get(best.station.id)!;
    const meet = [real.stations[k]!.lng, real.stations[k]!.lat] as const;
    const people = cardPeople(real, best, (station) => routeFor(routes, "out", k, station), shapes);
    const px = meetProjection([...people.flatMap((p) => [p.start, ...p.legs.flatMap((l) => l.path)]), meet], meet, box, area);
    const [mx, my] = px(meet);
    expect(mx).toBeGreaterThanOrEqual(area.x0 - 1e-6);
    expect(mx).toBeLessThanOrEqual(area.x1 + 1e-6);
    expect(my).toBeGreaterThanOrEqual(area.y0 - 1e-6);
    expect(my).toBeLessThanOrEqual(area.y1 + 1e-6);
    for (const p of people) {
      const [x, y] = px(p.start);
      expect(x).toBeGreaterThanOrEqual(box.x0 - 1e-6);
      expect(x).toBeLessThanOrEqual(box.x1 + 1e-6);
      expect(y).toBeGreaterThanOrEqual(box.y0 - 1e-6);
      expect(y).toBeLessThanOrEqual(box.y1 + 1e-6);
    }
  });
});

describe("bandColor", () => {
  const ningyocho = real.byId.get("ningyocho")!; // the Hibiya Line (silver gray) is listed first, then the Asakusa Line (rose)
  const [HIBIYA, ASAKUSA] = ["#B5B5AC", "#DC435F"];
  const arriving = (...colors: string[]): CardPerson[] => colors.map((color, i) => ({
    n: i + 1, label: `P${i + 1}`, minutes: 10, start: [139.7, 35.7],
    legs: [{ path: [], walk: false, color: "#00A7DB" }, { path: [], walk: false, color }, { path: [], walk: true, color: "#000000" }],
  }));

  it("takes the line that most people arrive on, not the line the station lists first", () => {
    expect(bandColor(real, ningyocho, arriving(ASAKUSA, ASAKUSA, HIBIYA))).toBe(ASAKUSA);
    expect(bandColor(real, ningyocho, arriving(HIBIYA, HIBIYA, ASAKUSA))).toBe(HIBIYA);
  });

  it("gives a tie to the line the station lists first, and falls back to it when nobody rides in", () => {
    expect(bandColor(real, ningyocho, arriving(ASAKUSA, HIBIYA))).toBe(HIBIYA);
    expect(bandColor(real, ningyocho, [])).toBe(HIBIYA);
  });

  it("colors a real 人形町 plan rose: two of three people arrive on the Asakusa Line", () => {
    const svg = card("?p=sengakuji_A~oshiage_B~kita-senju_C");
    expect(svg).toContain(">人形町<");
    expect(svg).toContain(`fill="${ASAKUSA}"/><text class="band"`);
  });
});

describe("textOn", () => {
  it("puts ink on a light line color and white on a dark one", () => {
    expect(textOn("#FFD400")).toBe(COLORS.ink); // the Sobu Line's yellow
    expect(textOn("#9ACD32")).toBe(COLORS.ink); // the Yamanote Line's green
    expect(textOn("#0079C2")).toBe("#ffffff");
    expect(textOn("#DD0077")).toBe("#ffffff");
  });
});

describe("textWidth", () => {
  it("counts a Japanese character as one em and Latin letters as about half", () => {
    expect(textWidth("神田")).toBe(2);
    expect(textWidth("Kanda")).toBeGreaterThan(2);
    expect(textWidth("Kanda")).toBeLessThan(4);
  });
});
