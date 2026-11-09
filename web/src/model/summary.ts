/** Numbers a person card shows. */
import type { PersonResult } from "../../core/types";

/** Less spare time than this before the last train home is flagged as tight. */
export const TIGHT_MIN = 15;

export function spareMinutes(lastDeparture: number | null, meetingEnd: number | null): number | null {
  return lastDeparture === null || meetingEnd === null ? null : lastDeparture - meetingEnd;
}

export interface PersonSummary {
  readonly total: number;
  readonly spare: number | null;
  readonly tight: boolean;
}

export function personSummary(p: PersonResult, meetingEnd: number | null): PersonSummary {
  const spare = spareMinutes(p.lastDeparture, meetingEnd);
  return { total: p.outMinutes + p.homeMinutes, spare, tight: spare !== null && spare < TIGHT_MIN };
}
