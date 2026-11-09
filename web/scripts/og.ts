/**
 * Renders the link preview (static/og.png, 1200x630) and the icons from the real data, with Playwright.
 * Run with `npm --prefix web run og` after a design change; the build copies static/ into the site.
 */
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { defaultDataDir, loadMatrixData, loadRouteData } from "../../cli/loadData";
import { rank } from "../core/rank";
import { routeFor } from "../core/routes";
import { routeLegs, type LngLat } from "../src/model/geometry";
import { plainSummary } from "../src/model/compare";
import { DEFAULT_PEOPLE, toParticipants } from "../src/model/scenario";

const OUT = join(import.meta.dirname, "..", "static");
const W = 1200;
const H = 630;
/** Where the routes sit: the right of the card, clear of the text. */
const BOX = { x0: 730, y0: 130, x1: 1090, y1: 510 };
const PAPER = "#f2f3f0";
const INK = "#17191c";
const MUTED = "#5c6168";
const SEAL = "#c8361d";
const NET = "#d3d7cf";
const FONT = "https://fonts.googleapis.com/css2?family=BIZ+UDPGothic:wght@400;700&display=swap";

const data = loadMatrixData(defaultDataDir());
const routes = loadRouteData(defaultDataDir());
const best = rank(toParticipants(DEFAULT_PEOPLE), {}, data).candidates[0]!;
const k = data.byId.get(best.station.id)!;
const meet: LngLat = [data.stations[k]!.lng, data.stations[k]!.lat];
const people = best.people.map((p, i) => ({
  n: i + 1, label: p.label, minutes: p.outMinutes,
  legs: routeLegs(data, routeFor(routes, "out", k, data.byId.get(p.startStation)!)),
}));

const K = Math.cos((35.7 * Math.PI) / 180);
const all = [...people.flatMap((p) => p.legs.flatMap((l) => l.path)), meet];
const xs = all.map(([x]) => x * K);
const ys = all.map(([, y]) => -y);
const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
const scale = Math.min((BOX.x1 - BOX.x0) / (maxX - minX), (BOX.y1 - BOX.y0) / (maxY - minY));
const offX = BOX.x0 + ((BOX.x1 - BOX.x0) - (maxX - minX) * scale) / 2;
const offY = BOX.y0 + ((BOX.y1 - BOX.y0) - (maxY - minY) * scale) / 2;
const px = ([lng, lat]: LngLat): [number, number] => [(lng * K - minX) * scale + offX, (-lat - minY) * scale + offY];
const pts = (path: readonly LngLat[]) => path.map((p) => px(p).map((v) => v.toFixed(1)).join(",")).join(" ");

const network = data.railways.map((r) => `<polyline points="${pts(r.stations.map((i) => [data.stations[i]!.lng, data.stations[i]!.lat] as const))}"/>`).join("");
const lines = people.flatMap((p) => p.legs.map((l) => (l.walk
  ? `<polyline points="${pts(l.path)}" stroke="${INK}" stroke-width="3" stroke-dasharray="0.5 7" fill="none" stroke-linecap="round"/>`
  : `<polyline points="${pts(l.path)}" stroke="${PAPER}" stroke-width="13" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
    + `<polyline points="${pts(l.path)}" stroke="${l.color}" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`))).join("");
const badges = people.map((p) => {
  const start = p.legs[0]!.path[0]!;
  const [x, y] = px(start);
  // The label goes on the side away from the meeting point, so it never sits on the route.
  const above = start[1] > meet[1];
  return `<g transform="translate(${x.toFixed(1)},${y.toFixed(1)})"><circle r="17" fill="${INK}" stroke="${PAPER}" stroke-width="4"/>`
    + `<text class="n">${p.n}</text><text class="who" y="${above ? -30 : 46}" text-anchor="middle">${p.label} <tspan>${p.minutes} min</tspan></text></g>`;
}).join("");
const [mx, my] = px(meet);
const seal = `<g transform="translate(${mx.toFixed(1)},${my.toFixed(1)})"><g transform="rotate(-4)"><rect x="-24" y="-24" width="48" height="48" rx="5" fill="${SEAL}" stroke="${PAPER}" stroke-width="4"/>`
  + `<text class="seal">要</text></g><text class="meet" x="0" y="58" text-anchor="middle">${best.station.ja}</text></g>`;

const card = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${FONT}"><style>
* { margin: 0; box-sizing: border-box; }
body { width: ${W}px; height: ${H}px; overflow: hidden; background: ${PAPER}; font-family: "BIZ UDPGothic", sans-serif; color: ${INK}; position: relative; }
svg { position: absolute; inset: 0; }
.net polyline { fill: none; stroke: ${NET}; stroke-width: 1.6; }
.n { fill: ${PAPER}; font: 700 18px "BIZ UDPGothic"; text-anchor: middle; dominant-baseline: central; }
.who { font: 700 24px "BIZ UDPGothic"; fill: ${INK}; paint-order: stroke; stroke: ${PAPER}; stroke-width: 8px; stroke-linejoin: round; }
.who tspan { font-weight: 400; fill: ${MUTED}; }
.seal { fill: #fff; font: 700 30px "BIZ UDPGothic"; text-anchor: middle; dominant-baseline: central; }
.meet { font: 700 30px "BIZ UDPGothic"; fill: ${INK}; paint-order: stroke; stroke: ${PAPER}; stroke-width: 9px; stroke-linejoin: round; }
.fade { position: absolute; inset: 0; background: linear-gradient(90deg, ${PAPER} 0%, ${PAPER} 40%, rgba(242, 243, 240, 0) 56%); }
.text { position: absolute; left: 64px; top: 60px; width: 580px; display: grid; gap: 18px; }
.brand { display: flex; align-items: center; gap: 14px; font: 700 34px "BIZ UDPGothic"; }
.brand i { font-style: normal; width: 48px; height: 48px; display: grid; place-items: center; background: ${SEAL}; color: #fff; border-radius: 5px; font-size: 28px; transform: rotate(-4deg); }
h1 { font: 700 66px/1.08 "BIZ UDPGothic"; letter-spacing: -0.01em; margin-top: 18px; }
.sub { font: 400 25px/1.45 "BIZ UDPGothic"; color: ${MUTED}; max-width: 520px; }
.ja { font: 700 23px "BIZ UDPGothic"; white-space: nowrap; }
.ticket { position: absolute; left: 64px; bottom: 56px; display: grid; gap: 2px; padding: 16px 24px; background: #e8eae3; border-radius: 8px; }
.ticket::before, .ticket::after { content: ""; position: absolute; top: 50%; margin-top: -10px; width: 20px; height: 20px; border-radius: 50%; background: ${PAPER}; }
.ticket::before { left: -10px; } .ticket::after { right: -10px; }
.ticket small { font: 400 17px "BIZ UDPGothic"; color: ${MUTED}; }
.ticket b { font: 700 34px "BIZ UDPGothic"; }
.ticket b span { font-size: 20px; color: ${MUTED}; margin-left: 10px; }
</style></head><body>
<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><g class="net">${network}</g>${lines}${badges}${seal}</svg>
<div class="fade"></div>
<div class="text">
  <div class="brand"><i>要</i>Kaname</div>
  <h1>Where should<br>we meet?</h1>
  <p class="sub">Find the closest station for all your friends in Tokyo.</p>
  <p class="ja">みんなにとって最適な集合場所を、東京の駅から。</p>
</div>
<div class="ticket"><small>${people.map((p) => p.label).join(" and ")} meet at</small><b>${best.station.ja}<span>${best.station.en} · ${Math.round(plainSummary(best).average)} min on average</span></b></div>
</body></html>`;

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

await render(card, W, H, "og.png");
await render(icon(180), 180, 180, "apple-touch-icon.png");
await render(icon(32), 32, 32, "favicon-32.png");
writeFileSync(join(OUT, "favicon.svg"), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="${SEAL}"/>`
  + `<text x="16" y="17" fill="#fff" font-family="BIZ UDPGothic, Hiragino Sans, Noto Sans JP, sans-serif" font-weight="700" font-size="21" text-anchor="middle" dominant-baseline="central">要</text></svg>\n`);
console.log(`wrote og.png, apple-touch-icon.png, favicon-32.png and favicon.svg to ${OUT}`);
