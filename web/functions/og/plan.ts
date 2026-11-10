/**
 * A plan's link preview picture, 1200 by 630 PNG, drawn on the first request and then served from
 * Cloudflare's cache. A link with no plan, or any failure, sends the general picture instead.
 */
import wasm from "@resvg/resvg-wasm/index_bg.wasm";
import { routeInBlock } from "../../core/routes";
import { CARD_VERSION, cardPeople, planCardSvg } from "../../preview/card";
import { routeBlock } from "../../preview/load";
import { answerFor, planQuery } from "../../preview/plan";
import { renderPng } from "../../preview/render";
import { cardFonts, previewData, ROBOTS, siteFiles, type Env } from "../../preview/server";

/** A day: a picture changes only with the data or the design, and both are in the cache key. */
const MAX_AGE = 86_400;

async function draw(env: Env, url: URL): Promise<Uint8Array | null> {
  const site = siteFiles(env, url.origin);
  const { matrix, shapes } = await previewData(site);
  const best = answerFor(matrix, url.search);
  if (best === null) return null;
  const k = matrix.byId.get(best.station.id)!;
  const block = await routeBlock(site, k);
  const people = cardPeople(matrix, best, (station) => routeInBlock(block, "out", k, station, matrix.nStations), shapes);
  return renderPng(planCardSvg({ data: matrix, best, people }), await cardFonts(site), wasm);
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const general = new Response(null, { status: 302, headers: { Location: `${url.origin}/og.png`, "X-Robots-Tag": ROBOTS } });
  try {
    const { matrix, version } = await previewData(siteFiles(ctx.env, url.origin));
    const query = planQuery(matrix, url.search);
    if (query === "") return general;
    const key = new Request(`${url.origin}/og/plan${query}${query === "" ? "?" : "&"}v=${version}-${CARD_VERSION}`);
    const cache = caches.default;
    const hit = await cache.match(key);
    if (hit) return hit;
    const png = await draw(ctx.env, url);
    if (png === null) return general;
    const res = new Response(png, { headers: { "Content-Type": "image/png", "Cache-Control": `public, max-age=${MAX_AGE}`, "X-Robots-Tag": ROBOTS } });
    ctx.waitUntil(cache.put(key, res.clone()));
    return res;
  } catch {
    return general;
  }
};
