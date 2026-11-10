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
  /** For the map: the seal has just stamped. Mu cheers and says where to meet. */
  readonly onStamp: () => void;
  /** A plan was shared: Mu cheers without a word, because the toast says it. */
  readonly onShare: () => void;
}

export function useMascot(best: CandidateResult | null, lang: Lang, name: (s: CandidateResult["station"]) => string): MascotState {
  /** Null when Mu is not cheering; else whether Mu says where to meet. */
  const [cheer, setCheer] = useState<{ readonly say: boolean } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const hour = useHour();
  const start = useCallback((say: boolean) => {
    setCheer({ say });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCheer(null), CHEER_MS);
  }, []);
  const onStamp = useCallback(() => start(true), [start]);
  const onShare = useCallback(() => start(false), [start]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  if (best === null) return { mood: null, bubble: null, onStamp, onShare };
  const mood = mascotMood({ cheering: cheer !== null, hardestMinutes: plainSummary(best).hardest.minutes, hour });
  const bubble = mood === "cheer" && cheer?.say === true ? t(lang, "mascotMeet", { station: name(best.station) }) : null;
  return { mood, bubble, onStamp, onShare };
}
