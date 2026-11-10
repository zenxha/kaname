/**
 * Mu, the conductor cat. Mu shows only with an answer, and only at a few moments, so the app stays a
 * serious tool: a cheer when the seal stamps, sweat at a long trip, sleep late at night, else a peek.
 */
export type Mood = "peek" | "cheer" | "sweat" | "sleepy";

/** How long Mu cheers, and says where to meet, after the seal stamps. */
export const CHEER_MS = 2600;
/** A hardest trip longer than this, in plain minutes there and back, makes Mu sweat. */
export const LONG_TRIP_MIN = 120;

/** 23:00 to 4:59 on the device's clock. */
export function isNight(hour: number): boolean {
  return hour >= 23 || hour < 5;
}

export interface MoodInput {
  /** The seal stamped a moment ago. */
  readonly cheering: boolean;
  /** The hardest trip on show, in plain minutes there and back. */
  readonly hardestMinutes: number;
  readonly hour: number;
}

/** A cheer wins, then a long trip, then the hour. */
export function mascotMood({ cheering, hardestMinutes, hour }: MoodInput): Mood {
  if (cheering) return "cheer";
  if (hardestMinutes > LONG_TRIP_MIN) return "sweat";
  if (isNight(hour)) return "sleepy";
  return "peek";
}
