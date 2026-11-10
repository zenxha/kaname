/**
 * Where each person's name goes on the map. A name sits beside its badge on the right or the left, or one
 * line up or down on that side. A name with no free spot hides, and its badge stays. Pure: screen pixels in,
 * spots out. The sizes mirror theme.css (.mk-badge, .mk-label and the .up/.down rules).
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Rect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** A badge center on screen and the size of the name next to it. */
export interface LabelInput {
  readonly at: Point;
  readonly size: Size;
}

export type LabelSpot = "right" | "right-up" | "right-down" | "left" | "left-up" | "left-down";
export type Placement = LabelSpot | "hidden";

/** Half of the 26 px badge. */
const BADGE_HALF = 13;
/** From the badge center to the near edge of the name: the name starts 32 px from the badge's left edge. */
const LABEL_GAP = 32 - BADGE_HALF;
/** Air between two boxes. A line up or down moves a name by its height plus twice this (theme.css: 4px). */
const AIR = 2;
/** In the right part of the map, a name tries the left side first. */
export const FLIP_SHARE = 0.62;

const RIGHT_FIRST: readonly LabelSpot[] = ["right", "right-down", "right-up", "left", "left-down", "left-up"];
const LEFT_FIRST: readonly LabelSpot[] = ["left", "left-down", "left-up", "right", "right-down", "right-up"];

export function badgeRect(p: Point): Rect {
  return { left: p.x - BADGE_HALF, top: p.y - BADGE_HALF, right: p.x + BADGE_HALF, bottom: p.y + BADGE_HALF };
}

export function labelRect(item: LabelInput, spot: LabelSpot): Rect {
  const { at, size } = item;
  const left = spot.startsWith("left") ? at.x - LABEL_GAP - size.width : at.x + LABEL_GAP;
  const line = spot.endsWith("-up") ? -1 : spot.endsWith("-down") ? 1 : 0;
  const top = at.y - size.height / 2 + line * (size.height + 2 * AIR);
  return { left, top, right: left + size.width, bottom: top + size.height };
}

/** True when the boxes touch or are closer than the air between them. */
export function overlaps(a: Rect, b: Rect): boolean {
  return a.left < b.right + AIR && b.left < a.right + AIR && a.top < b.bottom + AIR && b.top < a.bottom + AIR;
}

/**
 * One spot for each item, in order: an earlier item keeps a better spot, so put the focused person first.
 * A spot is free when it stays inside the map from left to right and touches no badge, no obstacle (the seal
 * and the meeting station's name) and no name already placed.
 */
export function placeLabels(items: readonly LabelInput[], obstacles: readonly Rect[], view: Size): Placement[] {
  const fixed = [...obstacles, ...items.map((item) => badgeRect(item.at))];
  const placed = items.reduce<{ readonly taken: readonly Rect[]; readonly out: readonly Placement[] }>((acc, item) => {
    const blocked = [...fixed, ...acc.taken];
    const free = (spot: LabelSpot): boolean => {
      const r = labelRect(item, spot);
      return r.left >= 0 && r.right <= view.width && !blocked.some((b) => overlaps(r, b));
    };
    const spot = (item.at.x > view.width * FLIP_SHARE ? LEFT_FIRST : RIGHT_FIRST).find(free);
    return spot === undefined
      ? { taken: acc.taken, out: [...acc.out, "hidden"] }
      : { taken: [...acc.taken, labelRect(item, spot)], out: [...acc.out, spot] };
  }, { taken: [], out: [] });
  return [...placed.out];
}
