/** Mu's mood and words for the answer on show: a cheer for a moment after each stamp, else the plan and the hour. */
import { useCallback, useEffect, useRef, useState } from "react";
import type { CandidateResult } from "../core/types";
import { plainSummary } from "./model/compare";
import { t, type Lang } from "./model/i18n";
import { CHEER_MS, mascotMood, type Mood } from "./model/mascot";
import { useHour } from "./useHour";

export interface MascotState {
  /** Null while there is no answer: Mu shows only with one. */
  readonly mood: Mood | null;
  readonly bubble: string | null;
  /** For the map: the seal has just stamped. */
  readonly onStamp: () => void;
}

export function useMascot(best: CandidateResult | null, lang: Lang, name: (s: CandidateResult["station"]) => string): MascotState {
  const [cheering, setCheering] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const hour = useHour();
  const onStamp = useCallback(() => {
    setCheering(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCheering(false), CHEER_MS);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  if (best === null) return { mood: null, bubble: null, onStamp };
  const mood = mascotMood({ cheering, hardestMinutes: plainSummary(best).hardest.minutes, hour });
  return { mood, bubble: mood === "cheer" ? t(lang, "mascotMeet", { station: name(best.station) }) : null, onStamp };
}
