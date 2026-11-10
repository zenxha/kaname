/** The functions' shared state: data and fonts load once per worker, and a failed load is tried again. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AssetFetch } from "../../preview/load";
import { CARD_FONTS } from "../../preview/render";
import { cardFonts, previewData, siteFiles } from "../../preview/server";
import { packData } from "../../scripts/pack";
import { DATA_DIR } from "../realData";

const STATIC = join(import.meta.dirname, "..", "..", "static");
const packed = packData(DATA_DIR);
const site: AssetFetch = async (path) => {
  const name = path.replace(/^\//, "");
  const gz = packed.get(name);
  if (gz) return new Response(new Uint8Array(gz));
  for (const dir of [DATA_DIR, STATIC]) {
    try {
      return new Response(readFileSync(join(dir, name)));
    } catch { /* the next folder */ }
  }
  return new Response("not found", { status: 404 });
};
const down: AssetFetch = async () => new Response("", { status: 503 });

describe("previewData", () => {
  it("tries again after a failed load, then keeps the data for the next request", async () => {
    await expect(previewData(down)).rejects.toThrow("503");
    const first = await previewData(site);
    expect(await previewData(site)).toBe(first);
  });
});

describe("cardFonts", () => {
  it("reads the card's fonts from the site, and names a missing one", async () => {
    await expect(cardFonts(down)).rejects.toThrow(CARD_FONTS[0]);
    const fonts = await cardFonts(site);
    expect(fonts.map((f) => f.byteLength)).toEqual(CARD_FONTS.map((f) => readFileSync(join(STATIC, f)).byteLength));
  });
});

describe("siteFiles", () => {
  it("asks the asset store for the full address of a site file", async () => {
    const asked: string[] = [];
    const files = siteFiles({ ASSETS: { fetch: async (input) => (asked.push(input), new Response("{}")) } }, "https://kaname.example");
    await files("/meta.json");
    expect(asked).toEqual(["https://kaname.example/meta.json"]);
  });
});
