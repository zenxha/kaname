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

/**
 * Sent with every function response, as web/static/_headers sends it with the static files: search
 * engines do not list the preview site. Remove both at launch.
 */
export const ROBOTS = "noindex, nofollow";

export function siteFiles(env: Env, origin: string): AssetFetch {
  return (path) => env.ASSETS.fetch(new URL(path, origin).toString());
}

/** A load kept for the next request; a failed one is not kept, so the next request tries again. */
function keep<T>(load: (site: AssetFetch) => Promise<T>): (site: AssetFetch) => Promise<T> {
  let kept: Promise<T> | null = null;
  return (site) => {
    kept ??= load(site).catch((e: unknown) => {
      kept = null;
      throw e;
    });
    return kept;
  };
}

export const previewData: (site: AssetFetch) => Promise<PreviewData> = keep(loadPreviewData);

export const cardFonts: (site: AssetFetch) => Promise<Uint8Array[]> = keep((site) => Promise.all(CARD_FONTS.map(async (name) => {
  const res = await site(`/${name}`);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
})));
