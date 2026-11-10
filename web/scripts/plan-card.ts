/**
 * Draws a plan's link preview picture from the local data, as the site's function draws it:
 * `npm --prefix web run plan-card -- "?p=shibamata_Tora&p=kunitachi_Kai" out.png`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { defaultDataDir, loadMatrixData, loadRouteData } from "../../cli/loadData";
import { routeFor } from "../core/routes";
import { cardPeople, planCardSvg } from "../preview/card";
import { answerFor } from "../preview/plan";
import { CARD_FONTS, renderPng } from "../preview/render";
import { parseShapes, stationsChecksum } from "../src/model/shapes";

const [search, out] = process.argv.slice(2);
if (search === undefined || out === undefined) throw new Error('usage: npm run plan-card -- "?p=..." out.png');
const dir = defaultDataDir();
const data = loadMatrixData(dir);
const routes = loadRouteData(dir);
const json = (name: string): unknown => JSON.parse(readFileSync(join(dir, name), "utf8"));
const shapes = parseShapes(json("shapes.json"), data, stationsChecksum(json("meta.json")));
const best = answerFor(data, search);
if (best === null) throw new Error("this link has no plan the app can rank");
const k = data.byId.get(best.station.id)!;
const people = cardPeople(data, best, (station) => routeFor(routes, "out", k, station), shapes);
const svg = planCardSvg({ data, best, people });
const fonts = CARD_FONTS.map((f) => readFileSync(join(import.meta.dirname, "..", "static", f)));
const wasm = readFileSync(createRequire(import.meta.url).resolve("@resvg/resvg-wasm/index_bg.wasm"));
writeFileSync(out, await renderPng(svg, fonts, wasm));
process.stdout.write(`${best.station.ja}: wrote ${out}\n`);
