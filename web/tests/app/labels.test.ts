/** Name labels on the map: each person's name finds a free spot, or hides, so no two names overlap. */
import { describe, expect, it } from "vitest";
import { badgeRect, labelRect, overlaps, placeLabels, type LabelInput, type Placement, type Rect } from "../../src/map/labels";

const VIEW = { width: 390, height: 844 };
const SIZE = { width: 80, height: 17 }; // "Aki 19 min" in the 13 px label font

const at = (x: number, y: number): LabelInput => ({ at: { x, y }, size: SIZE });

/** The box of a shown name; a hidden one fails the test. */
function shownRect(item: LabelInput, spot: Placement | undefined): Rect {
  if (spot === undefined || spot === "hidden") throw new Error("the name is hidden");
  return labelRect(item, spot);
}

/** A seeded generator, so a failure repeats. */
function random(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("map name labels", () => {
  it("put a lone name to the right of its badge", () => {
    expect(placeLabels([at(100, 300)], [], VIEW)).toEqual(["right"]);
  });

  it("hang a name to the left in the right part of the map", () => {
    expect(placeLabels([at(330, 300)], [], VIEW)).toEqual(["left"]);
  });

  it("move the second name when two people start close together", () => {
    const spots = placeLabels([at(100, 300), at(104, 306)], [], VIEW);
    expect(spots[0]).toBe("right");
    expect(spots[1]).not.toBe("hidden");
    expect(overlaps(shownRect(at(100, 300), spots[0]), shownRect(at(104, 306), spots[1]))).toBe(false);
  });

  it("keep the first person's spot, and hide a name only when every spot is taken", () => {
    const crowd = Array.from({ length: 9 }, () => at(150, 400));
    const spots = placeLabels(crowd, [], VIEW);
    expect(spots[0]).toBe("right");
    expect(spots.filter((s) => s !== "hidden")).toHaveLength(6);
    expect(spots.slice(6)).toEqual(["hidden", "hidden", "hidden"]);
  });

  it("keep names off the seal and the meeting station's name", () => {
    const seal: Rect = { left: 160, top: 280, right: 260, bottom: 320 };
    const spot = placeLabels([at(130, 300)], [seal], VIEW)[0];
    expect(spot).not.toBe("right");
    expect(overlaps(shownRect(at(130, 300), spot), seal)).toBe(false);
  });

  it("never let a shown name cover another name, a badge or the seal", () => {
    const next = random(7);
    for (let round = 0; round < 200; round++) {
      const cx = 40 + next() * 310;
      const cy = 40 + next() * 760;
      const items = Array.from({ length: 2 + Math.floor(next() * 10) }, () =>
        ({ at: { x: cx + (next() - 0.5) * 120, y: cy + (next() - 0.5) * 80 }, size: { width: 40 + next() * 90, height: 17 } }));
      const seal: Rect = { left: cx - 17, top: cy - 17, right: cx + 60, bottom: cy + 17 };
      const spots = placeLabels(items, [seal], VIEW);
      const shown = items.flatMap((item, i) => (spots[i] === "hidden" ? [] : [shownRect(item, spots[i])]));
      const blockers = [seal, ...items.map((item) => badgeRect(item.at))];
      for (const [i, r] of shown.entries()) {
        for (const other of shown.slice(i + 1)) expect(overlaps(r, other)).toBe(false);
        for (const b of blockers) expect(overlaps(r, b)).toBe(false);
      }
    }
  });
});
