/** Text color for a label on a line's own color. */
const INK = "#17191c";
const WHITE = "#ffffff";
/** Perceived brightness (0-255) above which dark text reads better than white. */
const LIGHT = 150;

export function textOn(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (m === null) return INK;
  const n = parseInt(m[1]!, 16);
  const brightness = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return brightness > LIGHT ? INK : WHITE;
}
