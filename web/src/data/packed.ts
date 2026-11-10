/**
 * Packed data for the web. The build (scripts/pack.ts) writes a gzip copy of each matrix and one gzip file
 * per station for each route direction, because hosts send binary files uncompressed and Cloudflare does
 * not answer Range requests. A first visit then loads about 1.5 MB instead of 12 MB.
 */

export const PACKED_DIR = "packed";

export function packedMatrixPath(file: string): string {
  return `${PACKED_DIR}/${file}.gz`;
}

export function packedRoutePath(direction: "out" | "home", candidate: number): string {
  return `${PACKED_DIR}/routes/${direction}/${candidate}.gz`;
}

/** A host that has no such file can answer with its HTML page and status 200, so look at the bytes. */
export function isGzip(bytes: Uint8Array): boolean {
  return bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

export async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  // slice(): a copy on a plain ArrayBuffer, which Blob accepts (a view could sit on shared memory).
  const stream = new Blob([bytes.slice()]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
