/**
 * A plan's link preview picture, 1200 by 630, as SVG: who meets where on the left, and each person's
 * trains to the station on a rail map on the right. It uses plain SVG attributes, which every renderer
 * reads, and the font family "BIZ UDPGothic", which the renderer must load.
 */
import type { MatrixData } from "../core/data";
import type { RouteHop } from "../core/routes";
import type { CandidateResult } from "../core/types";
import { changesText, plainSummary } from "../src/model/compare";
import { routeLegs, type LngLat, type MapLeg } from "../src/model/geometry";
import type { TrackShapes } from "../src/model/shapes";
import { namesText } from "./plan";

/** Part of each picture's cache key: change it with the design, so old pictures are not served. */
export const CARD_VERSION = "1";

export const W = 1200;
export const H = 630;
const LEFT = 64;
/** The text column: the station name and the lead line shrink to fit it. */
const TEXT_WIDTH = 560;
const STATION_MAX = 132;
const LEAD_MAX = 30;
/** Where the routes sit: the right of the card, clear of the text. */
export const PLAN_BOX: Box = { x0: 700, y0: 90, x1: 1130, y1: 540 };
/** The smallest map span in degrees, so a group near one station is not drawn at street scale. */
const MIN_SPAN = 0.05;
/** Names drawn beside badges; more would cover the map. */
const LABELED = 8;
const LABEL_MAX = 14;

export const COLORS = { paper: "#f2f3f0", ink: "#17191c", muted: "#5c6168", seal: "#c8361d", net: "#d3d7cf", ticket: "#e8eae3" } as const;
const FONT = 'font-family="BIZ UDPGothic"';

export interface Box {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

export interface CardPerson {
  readonly n: number;
  readonly label: string;
  /** The ride there, in minutes. */
  readonly minutes: number;
  readonly start: LngLat;
  readonly legs: readonly MapLeg[];
}

export interface PlanCardInput {
  readonly data: MatrixData;
  readonly best: CandidateResult;
  readonly people: readonly CardPerson[];
}

/** Text that is safe inside SVG text and attributes. */
export function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&${{ "&": "amp", "<": "lt", ">": "gt", '"': "quot", "'": "apos" }[c]!};`);
}

/** The width of a text in ems, close enough to fit it: Japanese characters are 1, Latin letters about half. */
export function textWidth(text: string): number {
  let em = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    // Average widths measured on BIZ UDPGothic Bold with resvg, rounded up.
    if (c >= 0x2e80) em += 1;
    else if (ch === " ") em += 0.34;
    else if (/[A-Z]/.test(ch)) em += 0.78;
    else if (/[a-z]/.test(ch)) em += 0.64;
    else if (/[0-9]/.test(ch)) em += 0.74;
    else em += 0.5;
  }
  return em;
}

function fitSize(text: string, max: number): number {
  return Math.min(max, Math.floor(TEXT_WIDTH / Math.max(textWidth(text), 0.01)));
}

/** The station name's font size: as large as fits the text column, up to 132 px. */
export function stationFontSize(ja: string): number {
  return fitSize(ja, STATION_MAX);
}

function shorten(label: string): string {
  return [...label].length > LABEL_MAX ? `${[...label].slice(0, LABEL_MAX - 1).join("")}…` : label;
}

/** Each person's rides to the meeting station, as the map draws them. */
export function cardPeople(data: MatrixData, best: CandidateResult, hopsFrom: (station: number) => readonly RouteHop[],
  shapes: TrackShapes | null): CardPerson[] {
  return best.people.map((p, i) => {
    const station = data.byId.get(p.startStation)!;
    const s = data.stations[station]!;
    return { n: i + 1, label: p.label, minutes: p.outMinutes, start: [s.lng, s.lat], legs: routeLegs(data, hopsFrom(station), shapes) };
  });
}

/** Map pixels for a box that holds every route and the meeting point. */
export function projection(points: readonly LngLat[], box: Box): (p: LngLat) => [number, number] {
  const k = Math.cos((35.7 * Math.PI) / 180);
  const xs = points.map(([x]) => x * k);
  const ys = points.map(([, y]) => -y);
  const mid = (a: readonly number[]) => (Math.min(...a) + Math.max(...a)) / 2;
  const spanX = Math.max(Math.max(...xs) - Math.min(...xs), MIN_SPAN * k);
  const spanY = Math.max(Math.max(...ys) - Math.min(...ys), MIN_SPAN);
  const scale = Math.min((box.x1 - box.x0) / spanX, (box.y1 - box.y0) / spanY);
  const [cx, cy] = [mid(xs), mid(ys)];
  const [bx, by] = [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2];
  return ([lng, lat]) => [(lng * k - cx) * scale + bx, (-lat - cy) * scale + by];
}

/** Keeps a centered name of this many ems inside the card: the x offset from its badge. */
function insideCard(x: number, em: number, size: number): number {
  // Wide letters such as m and w run over the average, so the name keeps a 10% margin.
  const half = (em * size * 1.1) / 2;
  const margin = 12;
  if (x + half > W - margin) return W - margin - half - x;
  if (x - half < margin) return margin + half - x;
  return 0;
}

export interface MapOptions {
  /** Covers the network under the text before the routes go on. */
  readonly fade?: string;
  /** The station's name under the seal; a card that shows the name large leaves it out. */
  readonly meetName?: boolean;
}

/**
 * The map: the rail network, each ride in its line's color on a paper casing, walks dotted, a numbered
 * badge and a name at each start, and the 要 seal at the meeting station.
 */
export function mapSvg(data: MatrixData, people: readonly CardPerson[], meet: { readonly at: LngLat; readonly ja: string },
  box: Box, { fade = "", meetName = true }: MapOptions = {}): string {
  const px = projection([...people.flatMap((p) => [p.start, ...p.legs.flatMap((l) => l.path)]), meet.at], box);
  const pts = (path: readonly LngLat[]) => path.map((p) => px(p).map((v) => v.toFixed(1)).join(",")).join(" ");
  const network = data.railways.map((r) => `<polyline points="${pts(r.stations.map((i) => [data.stations[i]!.lng, data.stations[i]!.lat] as const))}"/>`).join("");
  const { paper, ink, muted, seal, net } = COLORS;
  const lines = people.flatMap((p) => p.legs.map((l) => (l.walk
    ? `<polyline points="${pts(l.path)}" fill="none" stroke="${ink}" stroke-width="3" stroke-dasharray="0.5 7" stroke-linecap="round"/>`
    : `<polyline points="${pts(l.path)}" fill="none" stroke="${paper}" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>`
      + `<polyline points="${pts(l.path)}" fill="none" stroke="${escapeXml(l.color)}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`))).join("");
  const badges = people.map((p, i) => {
    const [x, y] = px(p.start);
    // The name goes on the side away from the meeting point, so it does not sit on the route.
    const above = p.start[1] > meet.at[1];
    const name = shorten(p.label);
    const dx = insideCard(x, textWidth(`${name} ${p.minutes} min`), 24);
    const label = i < LABELED
      ? `<text ${FONT} font-size="24" font-weight="700" fill="${ink}" text-anchor="middle" x="${dx.toFixed(1)}" y="${above ? -30 : 50}" paint-order="stroke" stroke="${paper}" stroke-width="8" stroke-linejoin="round">${escapeXml(name)} <tspan font-weight="400" fill="${muted}">${p.minutes} min</tspan></text>`
      : "";
    return `<g class="badge" transform="translate(${x.toFixed(1)},${y.toFixed(1)})"><circle r="17" fill="${ink}" stroke="${paper}" stroke-width="4"/>`
      + `<text ${FONT} font-size="18" font-weight="700" fill="${paper}" text-anchor="middle" y="6.5">${p.n}</text>${label}</g>`;
  }).join("");
  const [mx, my] = px(meet.at);
  const sealMark = `<g transform="translate(${mx.toFixed(1)},${my.toFixed(1)})"><g transform="rotate(-4)">`
    + `<rect x="-24" y="-24" width="48" height="48" rx="5" fill="${seal}" stroke="${paper}" stroke-width="4"/>`
    + `<text ${FONT} font-size="30" font-weight="700" fill="#fff" text-anchor="middle" y="10.5">要</text></g>`
    + (meetName ? `<text ${FONT} font-size="30" font-weight="700" fill="${ink}" text-anchor="middle" y="66" paint-order="stroke" stroke="${paper}" stroke-width="9" stroke-linejoin="round">${escapeXml(meet.ja)}</text>` : "")
    + "</g>";
  return `<g fill="none" stroke="${net}" stroke-width="1.6">${network}</g>${fade}${lines}${badges}${sealMark}`;
}

/** The network fades out under the text column, from solid paper to clear. */
function fadeRect(): string {
  const { paper } = COLORS;
  return `<defs><linearGradient id="fade" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="${paper}"/>`
    + `<stop offset="0.44" stop-color="${paper}"/><stop offset="0.58" stop-color="${paper}" stop-opacity="0"/></linearGradient></defs>`
    + `<rect width="${W}" height="${H}" fill="url(#fade)"/>`;
}

/** The ticket at the bottom left: the hardest trip, then the average, as on the app's ticket. */
function ticket(best: CandidateResult): string {
  const { average, hardest } = plainSummary(best);
  const small = `Hardest trip: ${hardest.label}, ${hardest.minutes} min, ${changesText("en", hardest.changes)}`;
  const big = `${Math.round(average)} min on average`;
  const width = Math.min(TEXT_WIDTH, Math.max(textWidth(small) * 20, textWidth(big) * 34) + 48);
  const { paper, ink, muted, ticket: fill } = COLORS;
  const [top, height] = [470, 100];
  return `<rect x="${LEFT}" y="${top}" width="${width.toFixed(0)}" height="${height}" rx="8" fill="${fill}"/>`
    + `<circle cx="${LEFT}" cy="${top + height / 2}" r="10" fill="${paper}"/><circle cx="${(LEFT + width).toFixed(0)}" cy="${top + height / 2}" r="10" fill="${paper}"/>`
    + `<text ${FONT} x="${LEFT + 24}" y="${top + 36}" font-size="20" fill="${muted}">${escapeXml(small)}</text>`
    + `<text ${FONT} x="${LEFT + 24}" y="${top + 78}" font-size="34" font-weight="700" fill="${ink}">${escapeXml(big)}</text>`;
}

export function planCardSvg({ data, best, people }: PlanCardInput): string {
  const k = data.byId.get(best.station.id)!;
  const meet: LngLat = [data.stations[k]!.lng, data.stations[k]!.lat];
  const { paper, ink, muted, seal } = COLORS;
  const lead = `${namesText(best.people.map((p) => p.label))} meet at`;
  const leadSize = fitSize(lead, LEAD_MAX);
  const size = stationFontSize(best.station.ja);
  const stationY = 214 + size * 0.9;
  const text = `<g transform="translate(${LEFT},52) rotate(-4 24 24)"><rect width="48" height="48" rx="5" fill="${seal}"/>`
    + `<text ${FONT} x="24" y="34" font-size="28" font-weight="700" fill="#fff" text-anchor="middle">要</text></g>`
    + `<text ${FONT} x="${LEFT + 62}" y="88" font-size="34" font-weight="700" fill="${ink}">Kaname</text>`
    + `<text ${FONT} x="${LEFT}" y="196" font-size="${leadSize}" fill="${muted}">${escapeXml(lead)}</text>`
    + `<text class="station" ${FONT} x="${LEFT - 4}" y="${stationY.toFixed(0)}" font-size="${size}" font-weight="700" fill="${ink}">${escapeXml(best.station.ja)}</text>`
    + `<text ${FONT} x="${LEFT}" y="${(stationY + 52).toFixed(0)}" font-size="34" font-weight="700" fill="${muted}">${escapeXml(best.station.en)}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`
    + `<rect width="${W}" height="${H}" fill="${paper}"/>${mapSvg(data, people, { at: meet, ja: best.station.ja }, PLAN_BOX, { fade: fadeRect(), meetName: false })}`
    + `${text}${ticket(best)}</svg>`;
}
