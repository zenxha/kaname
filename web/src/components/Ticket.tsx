/** The answer as a train ticket: the station, its two numbers, and what changes when you look at another. */
import { useState } from "react";
import { DEFAULT_LAMBDA } from "../../core/rank";
import { formatClock } from "../../core/time";
import type { CandidateResult } from "../../core/types";
import { changesText, compareToFirst, comparisonText, earliestLastTrain, plainSummary, type LastTrain } from "../model/compare";
import { t, type Lang } from "../model/i18n";

interface Props {
  readonly lang: Lang;
  readonly shown: CandidateResult;
  readonly first: CandidateResult;
  readonly onOpen: () => void;
  readonly onShare: () => void;
}

function stayText(last: LastTrain, lang: Lang): string {
  const who = last.labels.join(lang === "ja" ? "と" : " and ");
  return t(lang, "stayUntil", { time: formatClock(last.time), who });
}

export function Ticket({ lang, shown, first, onOpen, onShare }: Props) {
  const [why, setWhy] = useState(false);
  const comparison = compareToFirst(shown, first);
  const last = earliestLastTrain(shown);
  const plain = plainSummary(shown);
  return (
    <section className="ticket">
      <p className="sr-only" aria-live="polite">{`${shown.station.ja} ${shown.station.en}, ${Math.round(plain.average)} ${t(lang, "avgUnit")}`}</p>
      <button type="button" className="t-share" onClick={onShare}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 10V2M5 5l3-3 3 3M3 8v5.5h10V8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        {t(lang, "share")}
      </button>
      <button type="button" className="ticket-head" onClick={onOpen}>
        <span className="t-lab">{shown.station.id === first.station.id ? t(lang, "meetAt") : t(lang, "rankedAt", { n: shown.rank })}</span>
        <span className="t-name"><b>{shown.station.ja}</b><span>{shown.station.en}</span></span>
        <span className="t-nums">
          <span><b>{Math.round(plain.average)}</b>{t(lang, "avgUnit")}</span>
          <span><b>{plain.longest.minutes}</b>{t(lang, "longestWho", { who: plain.longest.label })}</span>
          <span className="t-changes">{changesText(lang, plain.changes)}</span>
        </span>
      </button>
      {last && <p className="t-stay">{stayText(last, lang)}</p>}
      {comparison && <p className="t-note">{comparisonText(lang, comparison)}</p>}
      <button type="button" className="t-why" aria-expanded={why} onClick={() => setWhy((w) => !w)}>{t(lang, "whatNumbers")}</button>
      {why && <p className="t-note muted">{t(lang, "numbersExplain", { n: DEFAULT_LAMBDA })}</p>}
    </section>
  );
}
