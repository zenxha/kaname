/**
 * Renders the site's link preview (static/og.png, 1200x630) and the icons from the real data.
 * The preview is a 要 station sign in the middle, with the example group's trains running in to it, like
 * a plan's preview (preview/card.ts). The sign and the words stay inside the middle square, which some
 * chat apps keep when they crop. Run with `npm --prefix web run og` after a design change; the build
 * copies static/ into the site.
 */
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { defaultDataDir, loadMatrixData, loadRouteData } from "../../cli/loadData";
import { rank } from "../core/rank";
import { routeFor } from "../core/routes";
import { cardPeople, cardSvg, COLORS, SIGN, signMap, signSvg, textWidth, W } from "../preview/card";
import { CARD_FONTS, renderPng } from "../preview/render";
import type { LngLat } from "../src/model/geometry";
import { parseShapes, stationsChecksum } from "../src/model/shapes";
import { DEFAULT_PEOPLE, toParticipants } from "../src/model/scenario";

const OUT = join(import.meta.dirname, "..", "static");
const { paper: PAPER, ink: INK, seal: SEAL } = COLORS;
const FONT = "https://fonts.googleapis.com/css2?family=BIZ+UDPGothic:wght@400;700&display=swap";
const SVG_FONT = 'font-family="BIZ UDPGothic"';
const HEADLINE = "Where should we meet?";
/** The widest line of words, in pixels: inside the middle square, with a margin. */
const TEXT_MAX = 560;
const TAGLINE = ["Find the closest station", "for all your friends in Tokyo."] as const;
const SIGN_TEXT = { lead: "かなめ", name: "要", en: "Kaname", band: "みんなにとって最適な集合場所を、東京の駅から。" } as const;

const data = loadMatrixData(defaultDataDir());
const routes = loadRouteData(defaultDataDir());
const readJson = (name: string): unknown => JSON.parse(readFileSync(join(defaultDataDir(), name), "utf8"));
const shapes = parseShapes(readJson("shapes.json"), data, stationsChecksum(readJson("meta.json")));
if (shapes === null) throw new Error("data/shapes.json does not fit the station data: run `kaname-pipeline shapes`");
const best = rank(toParticipants(DEFAULT_PEOPLE), {}, data).candidates[0]!;
const k = data.byId.get(best.station.id)!;
const meet: LngLat = [data.stations[k]!.lng, data.stations[k]!.lat];
// The example group's trains run in under the sign, as a plan's do.
const people = cardPeople(data, best, (station) => routeFor(routes, "out", k, station), shapes);
const map = signMap(data, people, meet);

/** Centered words over the map, with a paper halo so a route under them does not hide them. */
const words = (text: string, y: number, size: number, weight: number) =>
  `<text ${SVG_FONT} x="${W / 2}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${INK}" text-anchor="middle" paint-order="stroke" stroke="${PAPER}" stroke-width="12" stroke-linejoin="round">${text}</text>`;
const bottom = SIGN.y0 + SIGN.h;
const card = cardSvg(map.under
  + words(HEADLINE, SIGN.y0 - 38, Math.min(46, Math.floor(TEXT_MAX / textWidth(HEADLINE))), 700)
  + signSvg(SIGN_TEXT, SEAL, false)
  + TAGLINE.map((line, i) => words(line, bottom + 52 + i * 36, 26, 400)).join("")
  + map.over);
const fonts = CARD_FONTS.map((f) => readFileSync(join(OUT, f)));
const wasm = readFileSync(createRequire(import.meta.url).resolve("@resvg/resvg-wasm/index_bg.wasm"));
writeFileSync(join(OUT, "og.png"), await renderPng(card, fonts, wasm));

const icon = (size: number) => `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${FONT}"><style>
* { margin: 0; } body { width: ${size}px; height: ${size}px; display: grid; place-items: center; background: ${SEAL}; color: #fff; font: 700 ${Math.round(size * 0.62)}px/1 "BIZ UDPGothic"; }
</style></head><body>要</body></html>`;

async function render(html: string, width: number, height: number, file: string): Promise<void> {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(OUT, file), type: "png" });
  await browser.close();
}

await render(icon(180), 180, 180, "apple-touch-icon.png");
await render(icon(32), 32, 32, "favicon-32.png");
writeFileSync(join(OUT, "favicon.svg"), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="${SEAL}"/>`
  + `<text x="16" y="17" fill="#fff" font-family="BIZ UDPGothic, Hiragino Sans, Noto Sans JP, sans-serif" font-weight="700" font-size="21" text-anchor="middle" dominant-baseline="central">要</text></svg>\n`);
console.log(`wrote og.png, apple-touch-icon.png, favicon-32.png and favicon.svg to ${OUT}`);
