/** The answer as a train ticket: the station, its two numbers, and what changes when you look at another. */
import { useState } from "react";
import { DEFAULT_LAMBDA } from "../../core/rank";
import { formatClock } from "../../core/time";
import type { CandidateResult } from "../../core/types";
import { changesAllText, compareToFirst, comparisonText, earliestLastTrain, hardestText, plainSummary, type LastTrain } from "../model/compare";
import { t, type Lang } from "../model/i18n";

interface Props {
  readonly lang: Lang;
  readonly shown: CandidateResult;
  readonly first: CandidateResult;
  readonly onOpen: () => void;
  readonly onShare: () => void;
  /** The plan on this ticket was shared: a 改札鋏 punch in its top edge, as on a used paper ticket. */
  readonly punched: boolean;
  /** Set for the example group: the ticket offers a plan of your own instead of sharing the example. */
  readonly onStartOwn?: (() => void) | undefined;
}

function stayText(last: LastTrain, lang: Lang): string {
  const who = last.labels.join(lang === "ja" ? "と" : " and ");
  return t(lang, "stayUntil", { time: formatClock(last.time), who });
}

export function Ticket({ lang, shown, first, onOpen, onShare, punched, onStartOwn }: Props) {
  const [why, setWhy] = useState(false);
  const comparison = compareToFirst(shown, first);
  const last = earliestLastTrain(shown);
  const plain = plainSummary(shown);
  return (
    <section className={punched ? "ticket punched" : "ticket"}>
      {/* Five paper bits fall from the punch; theme.css animates them once. */}
      {punched && <span className="t-punch" aria-hidden="true"><i /><i /><i /><i /><i /></span>}
      <p className="sr-only" aria-live="polite">{`${shown.station.ja} ${shown.station.en}, ${Math.round(plain.average)} ${t(lang, "avgUnit")}`}</p>
      {onStartOwn ? (
        <button type="button" className="t-share t-own" onClick={onStartOwn}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          {t(lang, "startOwn")}
        </button>
      ) : (
        <button type="button" className="t-share" onClick={onShare}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 10V2M5 5l3-3 3 3M3 8v5.5h10V8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          {t(lang, "share")}
        </button>
      )}
      <button type="button" className="ticket-head" onClick={onOpen}>
        <span className="t-lab">{shown.station.id === first.station.id ? t(lang, "meetAt") : t(lang, "rankedAt", { n: shown.rank })}</span>
        <span className="t-name"><b>{shown.station.ja}</b><span>{shown.station.en}</span></span>
        <span className="t-nums">
          <span><b>{Math.round(plain.average)}</b>{t(lang, "avgUnit")}</span>
          <span><b>{plain.hardest.minutes}</b>{hardestText(lang, plain.hardest)}</span>
          <span className="t-changes">{changesAllText(lang, plain.changes)}</span>
        </span>
      </button>
      {last && <p className="t-stay">{stayText(last, lang)}</p>}
      {comparison && <p className="t-note">{comparisonText(lang, comparison)}</p>}
      <button type="button" className="t-why" aria-expanded={why} onClick={() => setWhy((w) => !w)}>{t(lang, "whatNumbers")}</button>
      {why && <p className="t-note muted">{t(lang, "numbersExplain", { n: DEFAULT_LAMBDA })}</p>}
    </section>
  );
}
