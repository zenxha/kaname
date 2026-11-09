/** Why the engine cannot plan a group, in the reader's language and with the person's name. */
import type { Windows } from "../../core/data";
import type { RankError } from "../../core/errors";
import { MAX_SNAP_M } from "../../core/stations";
import { t, type Lang } from "./i18n";

/**
 * The app checks its own input, so only these errors reach a user: a place too far from any station,
 * and a station with no evening train. Anything else gets a general message, never the engine's
 * English, which is written for the command line.
 */
export function problemText(lang: Lang, error: RankError, windows: Windows): string {
  const who = error.participant;
  if (who !== undefined && error.code === "LOCATION_TOO_FAR") return t(lang, "problemFar", { who, km: MAX_SNAP_M / 1000 });
  if (who !== undefined && error.code === "UNROUTABLE_STATION") {
    const [from, to] = error.place === "home" ? windows.home : windows.outbound;
    return t(lang, error.place === "home" ? "problemHome" : "problemStart", { who, from, to });
  }
  return t(lang, "problemOther");
}
