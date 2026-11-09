import { describe, expect, it } from "vitest";
import { RankError } from "../core/errors";
import { formatClock, parseClock } from "../core/time";

describe("clock times on the service day", () => {
  it.each([
    ["18:30", 1110],
    ["23:59", 1439],
    ["00:30", 1470],
    ["24:30", 1470],
    ["02:59", 1619],
    ["03:00", 180],
    ["9:05", 545],
    ["25:00", 1500], // Japanese timetable notation for 01:00
  ])("%s -> %i", (text, minutes) => {
    expect(parseClock(text)).toBe(minutes);
  });

  it.each(["", "1830", "27:00", "18:60", "ab:cd", "-1:00"])("rejects %j", (text) => {
    expect(() => parseClock(text)).toThrow(RankError);
  });

  it("formats past midnight as a wall clock", () => {
    expect(formatClock(1470)).toBe("00:30");
    expect(formatClock(1110)).toBe("18:30");
  });
});
