/**
 * A plan's link preview picture, 1200 by 630, as SVG: a station sign in the middle that names the
 * meeting station, and each person's trains to it on a rail map around the sign. Some chat apps, such as
 * Instagram, crop the picture to its middle square, so the sign stays inside that square. The picture
 * uses plain SVG attributes, which every renderer reads, and the font family "BIZ UDPGothic", which the
 * renderer must load.
 */
import type { MatrixData } from "../core/data";
import type { RouteHop } from "../core/routes";
import type { CandidateResult } from "../core/types";
import { plainSummary } from "../src/model/compare";
import { routeLegs, type LngLat, type MapLeg } from "../src/model/geometry";
import type { TrackShapes } from "../src/model/shapes";
import { namesText } from "./plan";

/** Part of each picture's cache key: change it with the design, so old pictures are not served. */
export const CARD_VERSION = "2";

export const W = 1200;
export const H = 630;
/** The middle square that a chat app keeps when it crops the picture to a square. */
export const MIDDLE = { x0: (W - H) / 2, x1: (W + H) / 2 } as const;
/** The station sign, centered. Its seal sticks out at the top right, still inside the middle square. */
export const SIGN = { x0: 340, y0: 166, w: 520, h: 268 } as const;
const BAND = 50;
const STATION_MAX = 112;
const LEAD_MAX = 24;
const BAND_TEXT_MAX = 22;
/** Where the map draws, with room for the names above and below the badges. */
const MAP_BOX: Box = { x0: 50, y0: 74, x1: 1150, y1: 556 };
/** The meeting point stays here, under the sign, wherever the people are. */
const MEET_AREA: Box = { x0: 420, y0: 260, x1: 780, y1: 340 };
/** The smallest map span in degrees, so a group near one station is not drawn at street scale. */
const MIN_SPAN = 0.05;
/** Names drawn beside badges; more would cover the map. */
const LABELED = 8;
const LABEL_MAX = 14;

export const COLORS = { paper: "#f2f3f0", ink: "#17191c", muted: "#5c6168", seal: "#c8361d", net: "#d3d7cf", ticket: "#e8eae3" } as const;
const WHITE = "#ffffff";
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

/** Map pixels for a point. */
export type Projector = (p: LngLat) => [number, number];

/** Characters that XML 1.0 cannot hold, such as U+0001, U+FFFE and a lone surrogate: resvg rejects them. */
const NOT_XML = /[^\t\n\r\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu;

/** Text that is safe inside SVG text and attributes. */
export function escapeXml(text: string): string {
  return text.replace(NOT_XML, "").replace(/[&<>"']/g, (c) => `&${{ "&": "amp", "<": "lt", ">": "gt", '"': "quot", "'": "apos" }[c]!};`);
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

/** The largest font size up to `max` that fits the text in `width` pixels. */
function fitSize(text: string, max: number, width: number): number {
  return Math.min(max, Math.floor(width / Math.max(textWidth(text), 0.01)));
}

/** The station name's font size: as large as fits the sign, up to 112 px. */
export function stationFontSize(ja: string): number {
  return fitSize(ja, STATION_MAX, SIGN.w - 100);
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

/** Lines of longitude are closer together than lines of latitude at Tokyo's latitude. */
const LNG_SCALE = Math.cos((35.7 * Math.PI) / 180);

/** Map pixels for a box that holds every route and the meeting point. */
export function projection(points: readonly LngLat[], box: Box): Projector {
  const k = LNG_SCALE;
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

interface Axis {
  /** The largest scale on this axis. */
  readonly scale: number;
  /** Where the meeting point goes at a scale no larger than that. */
  readonly place: (scale: number) => number;
}

/**
 * One axis of a map that keeps the meeting point (offset 0) between `keepLo` and `keepHi`, and every
 * other offset between `lo` and `hi`. The point goes as near the middle of its range as the map allows.
 */
function fitAxis(offsets: readonly number[], lo: number, hi: number, keepLo: number, keepHi: number, minSpan: number): Axis {
  const below = Math.min(0, ...offsets);
  const above = Math.max(0, ...offsets);
  const scale = Math.min(
    (hi - lo) / Math.max(above - below, minSpan),
    below < 0 ? (keepHi - lo) / -below : Infinity,
    above > 0 ? (hi - keepLo) / above : Infinity,
  );
  const place = (s: number) => {
    const [from, to] = [Math.max(lo - below * s, keepLo), Math.min(hi - above * s, keepHi)];
    return Math.min(Math.max((keepLo + keepHi) / 2, from), to);
  };
  return { scale, place };
}

/**
 * Map pixels that keep the meeting point in `meetArea` and every point in `box`, at the largest scale
 * that allows both. So a group that all lives on one side still uses most of the card.
 */
export function meetProjection(points: readonly LngLat[], meet: LngLat, box: Box, meetArea: Box): Projector {
  const k = LNG_SCALE;
  const [mx, my] = [meet[0] * k, -meet[1]];
  const ax = fitAxis(points.map(([x]) => x * k - mx), box.x0, box.x1, meetArea.x0, meetArea.x1, MIN_SPAN * k);
  const ay = fitAxis(points.map(([, y]) => -y - my), box.y0, box.y1, meetArea.y0, meetArea.y1, MIN_SPAN);
  const scale = Math.min(ax.scale, ay.scale);
  const [cx, cy] = [ax.place(scale), ay.place(scale)];
  return ([lng, lat]) => [(lng * k - mx) * scale + cx, (-lat - my) * scale + cy];
}

/** Every point the map must show: each start, each route and the meeting point. */
function mapPoints(people: readonly CardPerson[], meet: LngLat): LngLat[] {
  return [...people.flatMap((p) => [p.start, ...p.legs.flatMap((l) => l.path)]), meet];
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

const points = (px: Projector, path: readonly LngLat[]) => path.map((p) => px(p).map((v) => v.toFixed(1)).join(",")).join(" ");

/** The rail network, thin and grey, under everything. */
function networkSvg(data: MatrixData, px: Projector): string {
  const lines = data.railways.map((r) => `<polyline points="${points(px, r.stations.map((i) => [data.stations[i]!.lng, data.stations[i]!.lat] as const))}"/>`);
  return `<g fill="none" stroke="${COLORS.net}" stroke-width="1.6">${lines.join("")}</g>`;
}

/** Each ride in its line's color on a paper casing; each walk dotted. */
function routesSvg(people: readonly CardPerson[], px: Projector): string {
  const { paper, ink } = COLORS;
  return people.flatMap((p) => p.legs.map((l) => (l.walk
    ? `<polyline points="${points(px, l.path)}" fill="none" stroke="${ink}" stroke-width="3" stroke-dasharray="0.5 7" stroke-linecap="round"/>`
    : `<polyline points="${points(px, l.path)}" fill="none" stroke="${paper}" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>`
      + `<polyline points="${points(px, l.path)}" fill="none" stroke="${escapeXml(l.color)}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`))).join("");
}

/** A numbered badge at each start, and the name with the minutes on the side away from the meeting point. */
function badgesSvg(people: readonly CardPerson[], meet: LngLat, px: Projector): string {
  const { paper, ink, muted } = COLORS;
  return people.map((p) => {
    const [x, y] = px(p.start);
    // The name goes on the side away from the meeting point, so it does not sit on the route.
    const above = p.start[1] > meet[1];
    const name = shorten(p.label);
    const dx = insideCard(x, textWidth(`${name} ${p.minutes} min`), 24);
    const label = p.n <= LABELED
      ? `<text ${FONT} font-size="24" font-weight="700" fill="${ink}" text-anchor="middle" x="${dx.toFixed(1)}" y="${above ? -30 : 50}" paint-order="stroke" stroke="${paper}" stroke-width="8" stroke-linejoin="round">${escapeXml(name)} <tspan font-weight="400" fill="${muted}">${p.minutes} min</tspan></text>`
      : "";
    return `<g class="badge" transform="translate(${x.toFixed(1)},${y.toFixed(1)})"><circle r="17" fill="${ink}" stroke="${paper}" stroke-width="4"/>`
      + `<text ${FONT} font-size="18" font-weight="700" fill="${paper}" text-anchor="middle" y="6.5">${p.n}</text>${label}</g>`;
  }).join("");
}

export interface MapOptions {
  /** Covers the network under the text before the routes go on. */
  readonly fade?: string;
}

/**
 * The map that fits a box: the rail network, each ride in its line's color, walks dotted, a numbered
 * badge and a name at each start, and the 要 seal with the station's name at the meeting station.
 */
export function mapSvg(data: MatrixData, people: readonly CardPerson[], meet: { readonly at: LngLat; readonly ja: string },
  box: Box, { fade = "" }: MapOptions = {}): string {
  const px = projection(mapPoints(people, meet.at), box);
  const { paper, ink, seal } = COLORS;
  const [mx, my] = px(meet.at);
  const sealMark = `<g transform="translate(${mx.toFixed(1)},${my.toFixed(1)})"><g transform="rotate(-4)">`
    + `<rect x="-24" y="-24" width="48" height="48" rx="5" fill="${seal}" stroke="${paper}" stroke-width="4"/>`
    + `<text ${FONT} font-size="30" font-weight="700" fill="#fff" text-anchor="middle" y="10.5">要</text></g>`
    + `<text ${FONT} font-size="30" font-weight="700" fill="${ink}" text-anchor="middle" y="66" paint-order="stroke" stroke="${paper}" stroke-width="9" stroke-linejoin="round">${escapeXml(meet.ja)}</text>`
    + "</g>";
  return `${networkSvg(data, px)}${fade}${routesSvg(people, px)}${badgesSvg(people, meet.at, px)}${sealMark}`;
}

/** WCAG relative luminance of a "#rrggbb" color. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The text color with more contrast on a line color: white on a dark line, ink on a light one such as yellow. */
export function textOn(color: string): string {
  const back = luminance(color);
  return 1.05 / (back + 0.05) >= (back + 0.05) / (luminance(COLORS.ink) + 0.05) ? WHITE : COLORS.ink;
}

/** The sign's band takes the color of the station's first line, as a real station sign does. */
function bandColor(data: MatrixData, station: number): string {
  const color = data.railways[data.stations[station]!.railways[0] ?? -1]?.color ?? "";
  return /^#[0-9a-f]{6}$/i.test(color) ? color : COLORS.ink;
}

/** The station sign: who meets, the station in Japanese and English, a band in the line's color with the numbers, and the seal. */
function signSvg(best: CandidateResult, band: string): string {
  const { ink, muted, seal, paper } = COLORS;
  const { x0, y0, w, h } = SIGN;
  const cx = x0 + w / 2;
  const lead = `${namesText(best.people.map((p) => shorten(p.label)))} meet at`;
  const size = stationFontSize(best.station.ja);
  const nameY = y0 + 58 + size * 0.88;
  const { average, hardest } = plainSummary(best);
  const line = `${Math.round(average)} min on average · hardest trip ${hardest.minutes} min (${shorten(hardest.label)})`;
  const lineSize = fitSize(line, BAND_TEXT_MAX, w - 50);
  const bandTop = y0 + h - BAND;
  const r = 10;
  return `<g class="sign"><rect x="${x0 + 4}" y="${y0 + 6}" width="${w}" height="${h}" rx="${r}" fill="${ink}" opacity="0.12"/>`
    + `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="${r}" fill="${WHITE}" stroke="${ink}" stroke-width="2"/>`
    + `<text ${FONT} x="${cx}" y="${y0 + 46}" font-size="${fitSize(lead, LEAD_MAX, w - 120)}" fill="${muted}" text-anchor="middle">${escapeXml(lead)}</text>`
    + `<text class="station" ${FONT} x="${cx}" y="${nameY.toFixed(0)}" font-size="${size}" font-weight="700" fill="${ink}" text-anchor="middle">${escapeXml(best.station.ja)}</text>`
    + `<text ${FONT} x="${cx}" y="${(nameY + 40).toFixed(0)}" font-size="${fitSize(best.station.en, 30, w - 60)}" font-weight="700" fill="${muted}" text-anchor="middle">${escapeXml(best.station.en)}</text>`
    + `<path d="M${x0} ${bandTop} H${x0 + w} V${y0 + h - r} Q${x0 + w} ${y0 + h} ${x0 + w - r} ${y0 + h} H${x0 + r} Q${x0} ${y0 + h} ${x0} ${y0 + h - r} Z" fill="${band}"/>`
    + `<text class="band" ${FONT} x="${cx}" y="${(bandTop + BAND / 2 + lineSize * 0.36).toFixed(0)}" font-size="${lineSize}" font-weight="700" fill="${textOn(band)}" text-anchor="middle">${escapeXml(line)}</text>`
    + `<g transform="translate(${x0 + w - 30},${y0 + 8}) rotate(8)"><rect x="-32" y="-32" width="64" height="64" rx="6" fill="${seal}" stroke="${paper}" stroke-width="4"/>`
    + `<text ${FONT} font-size="40" font-weight="700" fill="#fff" text-anchor="middle" y="14">要</text></g></g>`;
}

/** Kaname's name at the top left. A square crop leaves it out, and nothing depends on it. */
function brandSvg(): string {
  const { seal, ink } = COLORS;
  return `<g transform="translate(40,34) rotate(-4 18 18)"><rect width="36" height="36" rx="4" fill="${seal}"/>`
    + `<text ${FONT} x="18" y="26" font-size="21" font-weight="700" fill="#fff" text-anchor="middle">要</text></g>`
    + `<text ${FONT} x="86" y="62" font-size="26" font-weight="700" fill="${ink}">Kaname</text>`;
}

/** A badge under the sign, which the sign covers: a person who starts close to the station. */
function underSign([x, y]: readonly [number, number]): boolean {
  const margin = 8;
  return x > SIGN.x0 + margin && x < SIGN.x0 + SIGN.w - margin && y > SIGN.y0 + margin && y < SIGN.y0 + SIGN.h - margin;
}

/** The map centered under a station sign. A badge at the sign's edge goes over the sign, so it stays readable. */
export function planCardSvg({ data, best, people }: PlanCardInput): string {
  const k = data.byId.get(best.station.id)!;
  const meet: LngLat = [data.stations[k]!.lng, data.stations[k]!.lat];
  const px = meetProjection(mapPoints(people, meet), meet, MAP_BOX, MEET_AREA);
  const covered = people.filter((p) => underSign(px(p.start)));
  const shown = people.filter((p) => !underSign(px(p.start)));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`
    + `<rect width="${W}" height="${H}" fill="${COLORS.paper}"/>${networkSvg(data, px)}${routesSvg(people, px)}`
    + `${badgesSvg(covered, meet, px)}${brandSvg()}${signSvg(best, bandColor(data, k))}${badgesSvg(shown, meet, px)}</svg>`;
}
