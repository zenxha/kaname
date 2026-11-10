/** Base map names under our markers fade out, so no half-covered place name shows around the seal. */
import { describe, expect, it } from "vitest";
import { fadedOpacity } from "../../src/map/basemapLabels";

describe("fadedOpacity", () => {
  it("hides the named labels and keeps the layer's own opacity for the rest", () => {
    expect(fadedOpacity(undefined, ["Tokyo"])).toEqual(["case", ["in", ["get", "name"], ["literal", ["Tokyo"]]], 0, 1]);
    expect(fadedOpacity(0.8, ["Tokyo", "Chiyoda"])).toEqual(["case", ["in", ["get", "name"], ["literal", ["Tokyo", "Chiyoda"]]], 0, 0.8]);
    const zoomed = ["interpolate", ["linear"], ["zoom"], 8, 0, 9, 1];
    expect(fadedOpacity(zoomed, ["Tokyo"])).toEqual(["case", ["in", ["get", "name"], ["literal", ["Tokyo"]]], 0, zoomed]);
  });

  it("gives the layer back its own opacity when nothing is under a marker", () => {
    expect(fadedOpacity(0.8, [])).toBe(0.8);
    expect(fadedOpacity(undefined, [])).toBeUndefined();
  });

  it("leaves an old-style zoom function alone, because an expression cannot hold one", () => {
    const old = { stops: [[8, 0], [9, 1]] };
    expect(fadedOpacity(old, ["Tokyo"])).toBe(old);
  });
});
