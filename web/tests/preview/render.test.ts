/** The card drawn as a PNG, with the site's own fonts, the way the server draws it. */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { routeFor } from "../../core/routes";
import { cardPeople, planCardSvg } from "../../preview/card";
import { answerFor } from "../../preview/plan";
import { CARD_FONTS, renderPng } from "../../preview/render";
import { real, realRoutes, realShapes } from "../realData";

const STATIC = join(import.meta.dirname, "..", "..", "static");
const wasm = readFileSync(createRequire(import.meta.url).resolve("@resvg/resvg-wasm/index_bg.wasm"));
const fonts = CARD_FONTS.map((f) => readFileSync(join(STATIC, f)));

describe("renderPng", () => {
  it("draws the card as a 1200 by 630 PNG", async () => {
    const best = answerFor(real, "?p=seiseki-sakuragaoka_Shizuku&p=shibamata_Tora&p=kunitachi_Kai")!;
    const k = real.byId.get(best.station.id)!;
    const routes = realRoutes();
    const people = cardPeople(real, best, (station) => routeFor(routes, "out", k, station), realShapes());
    const png = await renderPng(planCardSvg({ data: real, best, people }), fonts, wasm);
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdr = new DataView(png.buffer, png.byteOffset + 16, 8);
    expect([ihdr.getUint32(0), ihdr.getUint32(4)]).toEqual([1200, 630]);
  }, 60_000);
});
