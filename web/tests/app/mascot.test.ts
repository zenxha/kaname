/** Mu, the conductor cat: a few moods, picked by the plan and the hour, and never in the way of the answer. */
import { describe, expect, it } from "vitest";
import { CHEER_MS, isNight, LONG_TRIP_MIN, mascotMood } from "../../src/model/mascot";
import { t } from "../../src/model/i18n";

describe("mascotMood", () => {
  const calm = { cheering: false, hardestMinutes: 85, hour: 19 };

  it("peeks at you on an ordinary evening", () => {
    expect(mascotMood(calm)).toBe("peek");
  });

  it("cheers right after the seal stamps, whatever else is true", () => {
    expect(mascotMood({ ...calm, cheering: true })).toBe("cheer");
    expect(mascotMood({ cheering: true, hardestMinutes: 150, hour: 23 })).toBe("cheer");
  });

  it("sweats when someone's trip is over two hours, before it gets sleepy", () => {
    expect(LONG_TRIP_MIN).toBe(120);
    expect(mascotMood({ ...calm, hardestMinutes: 120 })).toBe("peek");
    expect(mascotMood({ ...calm, hardestMinutes: 121 })).toBe("sweat");
    expect(mascotMood({ ...calm, hardestMinutes: 121, hour: 23 })).toBe("sweat");
  });

  it("is sleepy from 23:00 until 5:00", () => {
    expect(mascotMood({ ...calm, hour: 23 })).toBe("sleepy");
    expect([22, 23, 0, 4, 5].map(isNight)).toEqual([false, true, true, true, false]);
  });

  it("cheers for a moment, not for long", () => {
    expect(CHEER_MS).toBeGreaterThanOrEqual(1500);
    expect(CHEER_MS).toBeLessThanOrEqual(4000);
  });

  it("says where to meet in both languages", () => {
    expect(t("en", "mascotMeet", { station: "Kanda" })).toBe("Meet at Kanda!");
    expect(t("ja", "mascotMeet", { station: "神田" })).toBe("集合は神田で！");
  });
});
