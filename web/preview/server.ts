/**
 * What the two Pages Functions share: the site's own files through Cloudflare's ASSETS binding, and the
 * loaded data and fonts, kept for the life of the worker, so only the first request pays for them.
 */
import { loadPreviewData, type AssetFetch, type PreviewData } from "./load";
import { CARD_FONTS } from "./render";

/** The part of Cloudflare's static asset binding that the preview uses. */
export interface Env {
  readonly ASSETS: { fetch(input: string): Promise<Response> };
}

export function siteFiles(env: Env, origin: string): AssetFetch {
  return (path) => env.ASSETS.fetch(new URL(path, origin).toString());
}

/** A load kept for the next request; a failed one is not kept, so the next request tries again. */
function keep<T>(load: () => Promise<T>): () => Promise<T> {
  let kept: Promise<T> | null = null;
  return () => {
    kept ??= load().catch((e: unknown) => {
      kept = null;
      throw e;
    });
    return kept;
  };
}

let files: AssetFetch | null = null;
const data = keep(() => loadPreviewData(files!));
const fonts = keep(async () => Promise.all(CARD_FONTS.map(async (name) => {
  const res = await files!(`/${name}`);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
})));

export function previewData(site: AssetFetch): Promise<PreviewData> {
  files = site;
  return data();
}

export function cardFonts(site: AssetFetch): Promise<Uint8Array[]> {
  files = site;
  return fonts();
}
