import { RankError } from "./errors";

/** A clock time before this hour belongs to the previous service day (00:30 is 24:30). */
const SERVICE_DAY_START_H = 3;

/** "23:30" -> 1410, "00:30" -> 1470, "24:30" -> 1470. Minutes after 00:00 of the service day. */
export function parseClock(text: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  const h = m ? Number(m[1]) : NaN;
  const min = m ? Number(m[2]) : NaN;
  if (!m || h > 24 + SERVICE_DAY_START_H - 1 || min > 59) {
    throw new RankError("BAD_OPTION", `"${text}" is not a time. Use HH:MM, for example 23:30`);
  }
  const minutes = h * 60 + min;
  return h < SERVICE_DAY_START_H ? minutes + 24 * 60 : minutes;
}

/** 1470 -> "00:30" (wall clock). */
export function formatClock(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
