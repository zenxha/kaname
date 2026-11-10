/** SVG to PNG with resvg (WebAssembly), the same in a Cloudflare function and in Node tests. */
import { initWasm, Resvg } from "@resvg/resvg-wasm";

/** The card's fonts, in the site's static files: BIZ UDPGothic (SIL Open Font License 1.1). */
export const CARD_FONTS = ["BIZUDPGothic-Regular.ttf", "BIZUDPGothic-Bold.ttf"] as const;

/** resvg starts once per process; a second start throws. A failed start is tried again on the next call. */
let started: Promise<void> | null = null;

function start(wasm: WebAssembly.Module | BufferSource): Promise<void> {
  started ??= initWasm(wasm).catch((e: unknown) => {
    started = null;
    throw e;
  });
  return started;
}

export async function renderPng(svg: string, fonts: readonly Uint8Array[], wasm: WebAssembly.Module | BufferSource): Promise<Uint8Array> {
  await start(wasm);
  const resvg = new Resvg(svg, {
    font: { fontBuffers: [...fonts], loadSystemFonts: false, defaultFontFamily: "BIZ UDPGothic" },
    fitTo: { mode: "original" },
  });
  try {
    const image = resvg.render();
    try {
      return image.asPng();
    } finally {
      image.free();
    }
  } finally {
    resvg.free();
  }
}
