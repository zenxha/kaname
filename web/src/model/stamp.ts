/**
 * The 要 seal's stamp, once for each new answer: it hovers big with a shadow, drops, hits the paper
 * (ink flies, and a phone gives one short tap), and settles a little crooked, like a real hanko.
 * theme.css draws it, and reads the two times from the marker as --stamp-ms and --impact-ms.
 */

/** The whole stamp. */
export const STAMP_MS = 620;
/** When the seal hits the paper: 58% of the stamp, the keyframe where theme.css squashes it. */
export const IMPACT_MS = 360;
/** One short tap of vibration. */
export const BUZZ_MS = 12;

export interface InkDot {
  readonly dx: number;
  readonly dy: number;
  readonly size: number;
}

/** Ink that flies off on impact: six dots all around the seal, 16 to 30 px out. */
export const SPLAT: readonly InkDot[] = [
  { dx: -22, dy: -18, size: 5 },
  { dx: 20, dy: -22, size: 4 },
  { dx: 26, dy: 6, size: 3 },
  { dx: 16, dy: 22, size: 5 },
  { dx: -12, dy: 24, size: 3 },
  { dx: -26, dy: 4, size: 4 },
];

/**
 * Browsers block vibration until the visitor has touched the page, and iPhones have none. A stamp
 * without animation (reduced motion, or a redraw of an answer already shown) taps nothing either.
 */
export function shouldBuzz(s: { readonly animate: boolean; readonly active: boolean; readonly canVibrate: boolean }): boolean {
  return s.animate && s.active && s.canVibrate;
}
