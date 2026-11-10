/** The 要 seal's stamp: it hovers, drops, hits the paper with ink and one short tap, and settles crooked. */
import { describe, expect, it } from "vitest";
import { BUZZ_MS, IMPACT_MS, SPLAT, STAMP_MS, shouldBuzz } from "../../src/model/stamp";

describe("the seal stamp", () => {
  it("takes about half a second and hits the paper just after the middle, where the stylesheet puts it (58%)", () => {
    expect(STAMP_MS).toBeGreaterThanOrEqual(500);
    expect(STAMP_MS).toBeLessThanOrEqual(700);
    expect(IMPACT_MS / STAMP_MS).toBeCloseTo(0.58, 2);
    expect(BUZZ_MS).toBeLessThanOrEqual(20); // a tap, not a buzz
  });

  it("throws ink all around the seal, a short way out", () => {
    const quarter = (dx: number, dy: number) => Math.floor((((Math.atan2(dy, dx) + 2 * Math.PI) % (2 * Math.PI)) / (Math.PI / 2)));
    expect(new Set(SPLAT.map((d) => quarter(d.dx, d.dy)))).toEqual(new Set([0, 1, 2, 3]));
    for (const d of SPLAT) {
      expect(Math.hypot(d.dx, d.dy)).toBeGreaterThanOrEqual(16);
      expect(Math.hypot(d.dx, d.dy)).toBeLessThanOrEqual(30);
    }
  });

  it("taps the phone only for an animated stamp, after the visitor touched the page, on a phone that can", () => {
    expect(shouldBuzz({ animate: true, active: true, canVibrate: true })).toBe(true);
    expect(shouldBuzz({ animate: false, active: true, canVibrate: true })).toBe(false);
    expect(shouldBuzz({ animate: true, active: false, canVibrate: true })).toBe(false); // browsers block it before a touch
    expect(shouldBuzz({ animate: true, active: true, canVibrate: false })).toBe(false); // iPhones have no vibrate
  });
});
