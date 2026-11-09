/** Why the engine cannot plan a group, in the reader's language and with the person's name. */
import type { RankError } from "../../core/errors";
import { t, type Lang } from "./i18n";

export function problemText(lang: Lang, error: RankError): string {
  const who = error.participant;
  if (who !== undefined && error.code === "LOCATION_TOO_FAR") return t(lang, "problemFar", { who });
  if (who !== undefined && error.code === "UNROUTABLE_STATION") {
    return t(lang, error.place === "home" ? "problemHome" : "problemStart", { who });
  }
  return t(lang, "problemOther", { detail: error.message });
}
