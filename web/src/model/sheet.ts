/** The phone's result sheet: three resting heights over the map. */
export type Snap = "peek" | "half" | "full";

const SNAPS: readonly Snap[] = ["peek", "half", "full"];
/** Enough for the ticket: the station, its numbers and the handle. */
export const PEEK_PX = 196;
/** Map left visible above a full sheet, for the brand bar and a strip of map. */
export const FULL_GAP_PX = 72;
const HALF_SHARE = 0.55;

export function visibleHeight(snap: Snap, viewport: number): number {
  if (snap === "peek") return Math.min(PEEK_PX, Math.round(viewport / 2));
  if (snap === "half") return Math.round(viewport * HALF_SHARE);
  return viewport - FULL_GAP_PX;
}

export function nextSnap(snap: Snap): Snap {
  return SNAPS[(SNAPS.indexOf(snap) + 1) % SNAPS.length]!;
}

export function nearestSnap(visible: number, viewport: number): Snap {
  return SNAPS.reduce((best, s) =>
    Math.abs(visibleHeight(s, viewport) - visible) < Math.abs(visibleHeight(best, viewport) - visible) ? s : best);
}
