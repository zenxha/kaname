/** The answer as a train ticket: the station, its two numbers, and what changes when you look at another. */
import { useState } from "react";
import { DEFAULT_LAMBDA } from "../../core/rank";
import { formatClock } from "../../core/time";
import type { CandidateResult, StationInfo } from "../../core/types";
import { compareToFirst, type Comparison, type Dropped } from "../model/compare";
import { t, type Lang } from "../model/i18n";

interface Props {
  readonly lang: Lang;
  readonly shown: CandidateResult;
  readonly first: CandidateResult;
  readonly dropped: Dropped | null;
  readonly open: boolean;
  readonly onOpen: () => void;
}

const name = (s: StationInfo, lang: Lang) => (lang === "ja" ? s.ja : s.en);

function comparisonText(c: Comparison, lang: Lang): string {
  const station = name(c.station, lang);
  const n = Math.abs(c.average);
  const avg = c.average === 0 ? t(lang, "sameAverage", { station })
    : t(lang, c.average > 0 ? "moreAverage" : "lessAverage", { station, n });
  const trips = c.people.map((p) => (p.minutes === 0 ? t(lang, "tripSame", { who: p.label })
    : t(lang, p.minutes > 0 ? "tripLonger" : "tripShorter", { who: p.label, n: Math.abs(p.minutes) })));
  return `${avg} ${trips.join(lang === "ja" ? "、" : ", ")}${lang === "ja" ? "。" : "."}`;
}

function droppedText(d: Dropped, lang: Lang): string {
  const station = name(d.station, lang);
  const why = d.people.map((p) => t(lang, "missesLastTrain", { who: p.label, station, time: formatClock(p.lastDeparture) }));
  return [t(lang, "droppedWinner", { station }), ...why].join(" ");
}

export function Ticket({ lang, shown, first, dropped, open, onOpen }: Props) {
  const [why, setWhy] = useState(false);
  const comparison = compareToFirst(shown, first);
  return (
    <section className="ticket" aria-live="polite">
      <button type="button" className="ticket-head" aria-expanded={open} onClick={onOpen}>
        <span className="t-lab">{shown.station.id === first.station.id ? t(lang, "meetAt") : t(lang, "rankedAt", { n: shown.rank })}</span>
        <span className="t-name"><b>{shown.station.ja}</b><span>{shown.station.en}</span></span>
        <span className="t-nums">
          <span><b>{Math.round(shown.average)}</b>{t(lang, "avgUnit")}</span>
          <span><b>{shown.worst.cost}</b>{t(lang, "longestWho", { who: shown.worst.label })}</span>
        </span>
      </button>
      {comparison && <p className="t-note">{comparisonText(comparison, lang)}</p>}
      {dropped && <p className="t-note">{droppedText(dropped, lang)}</p>}
      <button type="button" className="t-why" aria-expanded={why} onClick={() => setWhy((w) => !w)}>{t(lang, "whatNumbers")}</button>
      {why && <p className="t-note muted">{t(lang, "numbersExplain", { n: DEFAULT_LAMBDA })}</p>}
    </section>
  );
}
