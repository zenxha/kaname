/** The iteration 2 model: ride steps, line chips, comparisons, the draw-in animation and the sheet. */
import { describe, expect, it } from "vitest";
import { rank } from "../../core/rank";
import { routeFor } from "../../core/routes";
import { findStation } from "../../core/stations";
import { compareToFirst, droppedWinner } from "../../src/model/compare";
import { drawDuration, partialLegs } from "../../src/model/drawIn";
import { routeFeatures } from "../../src/map/layers";
import { routeLegs } from "../../src/model/geometry";
import { lineChips, rideSteps } from "../../src/model/itinerary";
import { nearestSnap, nextSnap, visibleHeight } from "../../src/model/sheet";
import { real, realRoutes } from "../realData";

const routes = realRoutes();
const st = (name: string) => findStation(real, name);
const line = (i: number) => real.railways[i]!.ja;
const out = (meet: string, from: string) => routeFor(routes, "out", st(meet), st(from));
const SHIZUKU = { label: "Shizuku", start: { station: "seiseki-sakuragaoka" } };
const TORA = { label: "Tora", start: { station: "shibamata" } };
const HITORI = { label: "Hitori", start: { station: "kanazawa-hakkei" } };

describe("rideSteps", () => {
  it("reads Tora's trip to 神保町 as boardings, walks and a through train", () => {
    const steps = rideSteps(real, out("神保町", "柴又"));
    expect(steps.map((s) => s.kind)).toEqual(["board", "walk", "stay", "walk", "arrive"]);
    expect(steps[0]).toMatchObject({ kind: "board", station: st("柴又") });
    expect(line((steps[0] as { railway: number }).railway)).toBe("金町線");
    expect(steps[1]).toMatchObject({ kind: "walk", from: st("京成金町"), station: st("金町") });
    expect(line((steps[2] as { railway: number }).railway)).toBe("千代田線");
    expect(steps[3]).toMatchObject({ kind: "walk", from: st("新御茶ノ水"), station: st("ogawamachi-toei") });
    expect(steps.at(-1)).toEqual({ kind: "arrive", station: st("神保町") });
  });

  it("counts a line that continues across hops once", () => {
    const hops = out("品川", "聖蹟桜ヶ丘");
    expect(hops.length).toBeGreaterThan(2);
    const steps = rideSteps(real, hops);
    expect(steps.map((s) => s.kind)).toEqual(["board", "change", "arrive"]);
    expect(lineChips(real, hops).map(line)).toEqual(["京王線", "山手線"]);
  });

  it("lists every line Tora rides, in order", () => {
    expect(lineChips(real, out("神保町", "柴又")).map(line)).toEqual(["金町線", "常磐線各駅停車", "千代田線", "新宿線"]);
  });

  it("has nothing to ride when the person is already there", () => {
    expect(rideSteps(real, [])).toEqual([]);
    expect(lineChips(real, [])).toEqual([]);
  });
});

describe("routeLegs", () => {
  it("colors each ride by its line and adds a straight step for each walk", () => {
    const legs = routeLegs(real, out("神保町", "柴又"));
    expect(legs.map((l) => l.walk)).toEqual([false, true, false, false, true, false]);
    expect(legs[0]!.color.toLowerCase()).toBe(real.railways.find((r) => r.ja === "金町線")!.color.toLowerCase());
    expect(legs[1]!.path).toHaveLength(2);
    expect(legs[1]!.path[0]).toEqual(legs[0]!.path.at(-1));
    expect(legs[1]!.path[1]).toEqual(legs[2]!.path[0]);
  });
});

describe("routeFeatures", () => {
  it("makes one line per ride and walk, a home line only when there is one, and skips stubs", () => {
    const legs = routeLegs(real, out("神保町", "柴又"));
    const fc = routeFeatures([
      { id: "p2", legs, home: [] },
      { id: "p3", legs: [{ path: [[139.7, 35.6]], walk: false, color: "#000000" }], home: [[139.7, 35.6], [139.8, 35.7]] },
    ]);
    expect(fc.features).toHaveLength(legs.length + 1);
    expect(fc.features.filter((f) => f.properties?.walk === true)).toHaveLength(2);
    expect(fc.features.at(-1)!.properties).toMatchObject({ who: "p3", home: true });
  });
});

describe("compareToFirst", () => {
  const two = rank([SHIZUKU, TORA], {}, real);
  const [first, second] = two.candidates;

  it("is null for the first station itself", () => {
    expect(compareToFirst(first!, first!)).toBeNull();
  });

  it("says how the average and each round trip change at the runner-up", () => {
    expect(first!.station.id).toBe("jimbocho");
    expect(second!.station.id).toBe("kudanshita");
    expect(compareToFirst(second!, first!)).toEqual({
      station: first!.station,
      average: 0,
      people: [{ label: "Shizuku", minutes: -3 }, { label: "Tora", minutes: 3 }],
    });
  });
});

describe("droppedWinner", () => {
  const END = 23 * 60 + 30;
  const open = rank([SHIZUKU, TORA, HITORI], {}, real);
  const closed = rank([SHIZUKU, TORA, HITORI], { meetingEnd: END }, real);

  it("names the station a meeting end rules out, and whose last train does it", () => {
    expect(open.candidates[0]!.station.id).toBe("shinagawa");
    expect(closed.candidates[0]!.station.id).toBe("tokyo");
    expect(droppedWinner(open, closed, END)).toEqual({
      station: open.candidates[0]!.station,
      people: [{ label: "Tora", lastDeparture: 23 * 60 + 18 }],
    });
  });

  it("is null when the first station still works", () => {
    const two = rank([SHIZUKU, TORA], {}, real);
    expect(droppedWinner(two, rank([SHIZUKU, TORA], { meetingEnd: END }, real), END)).toBeNull();
  });
});

describe("draw-in", () => {
  const legs = [
    { path: [[0, 0], [2, 0]] as const, walk: false, color: "#111111" },
    { path: [[2, 0], [3, 0]] as const, walk: true, color: "#222222" },
  ];

  it("cuts the legs at a share of their total length", () => {
    expect(partialLegs(legs, 0)).toEqual([]);
    expect(partialLegs(legs, 0.5)).toEqual([{ ...legs[0], path: [[0, 0], [1.5, 0]] }]);
    const most = partialLegs(legs, 0.8);
    expect(most[0]).toEqual(legs[0]);
    expect(most[1]!.path[1]![0]).toBeCloseTo(2.4, 9);
    expect(partialLegs(legs, 1)).toEqual(legs);
    expect(partialLegs(legs, 7)).toEqual(legs);
  });

  it("takes longer for a longer ride, between half a second and a second", () => {
    expect(drawDuration(0)).toBe(500);
    expect(drawDuration(45)).toBe(750);
    expect(drawDuration(90)).toBe(1000);
    expect(drawDuration(240)).toBe(1000);
  });
});

describe("sheet", () => {
  it("has three heights that fit the screen", () => {
    expect(visibleHeight("peek", 800)).toBe(196);
    expect(visibleHeight("half", 800)).toBe(440);
    expect(visibleHeight("full", 800)).toBe(728);
    expect(visibleHeight("peek", 300)).toBe(150);
  });

  it("cycles on a tap and settles at the nearest height after a drag", () => {
    expect(nextSnap("peek")).toBe("half");
    expect(nextSnap("half")).toBe("full");
    expect(nextSnap("full")).toBe("peek");
    expect(nearestSnap(300, 800)).toBe("peek");
    expect(nearestSnap(500, 800)).toBe("half");
    expect(nearestSnap(700, 800)).toBe("full");
  });
});
