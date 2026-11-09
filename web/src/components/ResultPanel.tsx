import { useId } from "react";
import { formatClock, parseClock } from "../../core/time";
import type { CandidateResult, Exclusion } from "../../core/types";
import { t, type Lang } from "../model/i18n";

interface ResultProps {
  readonly lang: Lang;
  readonly best: CandidateResult;
}

export function ResultCard({ lang, best }: ResultProps) {
  return (
    <section className="card result" aria-live="polite">
      <span className="label" style={{ color: "var(--accent)" }}>{t(lang, "meetAt")}</span>
      <div className="result-name">
        <b>{best.station.ja}</b>
        <span>{best.station.en}</span>
      </div>
      <div className="stats">
        <div className="stat"><b>{Math.round(best.average)}</b><span className="label">{t(lang, "avgMin")}</span></div>
        <div className="stat"><b>{best.worst.cost}</b><span className="label">{t(lang, "worstMin")}</span></div>
      </div>
      <span className="label">{t(lang, "worstWho", { who: best.worst.label })}</span>
    </section>
  );
}

interface NextProps {
  readonly lang: Lang;
  readonly candidates: readonly CandidateResult[];
  readonly selected: string;
  readonly onSelect: (id: string) => void;
}

export function NextBest({ lang, candidates, selected, onSelect }: NextProps) {
  return (
    <section className="card next">
      <span className="label">{t(lang, "ranking")}</span>
      <ol>
        {candidates.slice(0, 5).map((c) => (
          <li key={c.station.id}>
            <button type="button" aria-pressed={c.station.id === selected} onClick={() => onSelect(c.station.id)}>
              <span className="rank">{c.rank}</span>
              <span className="name">{c.station.ja}<small>{c.station.en}</small></span>
              <span className="nums">{Math.round(c.average)} / {c.worst.cost}</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

interface ControlProps {
  readonly lang: Lang;
  readonly alpha: number;
  readonly meetingEnd: number | null;
  readonly excluded: readonly Exclusion[];
  readonly onAlpha: (alpha: number) => void;
  readonly onMeetingEnd: (end: number | null) => void;
}

/** Slider: left is efficient (alpha 1), right is fair (alpha 0), as in the design. */
export function Controls({ lang, alpha, meetingEnd, excluded, onAlpha, onMeetingEnd }: ControlProps) {
  const sliderId = useId();
  const endId = useId();
  const toInput = (m: number | null) => (m === null ? "" : formatClock(m));
  return (
    <section className="card controls">
      <div className="slider-ends label" aria-hidden="true"><span>{t(lang, "efficient")}</span><span>{t(lang, "fair")}</span></div>
      <label htmlFor={sliderId} className="label" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
        {t(lang, "alphaLabel")}
      </label>
      <input
        id={sliderId}
        className="slider"
        type="range"
        min={0}
        max={100}
        value={Math.round((1 - alpha) * 100)}
        onChange={(e) => onAlpha(1 - Number(e.target.value) / 100)}
      />
      <label htmlFor={endId} className="label">{t(lang, "meetingEnds")}</label>
      <div className="end-row">
        <input
          id={endId}
          className="input"
          type="time"
          value={toInput(meetingEnd)}
          onChange={(e) => onMeetingEnd(e.target.value ? parseClock(e.target.value) : null)}
        />
        {meetingEnd !== null && <button type="button" className="btn" onClick={() => onMeetingEnd(null)}>{t(lang, "clearEnd")}</button>}
      </div>
      {meetingEnd !== null && excluded.length > 0 && (
        <details className="excluded">
          <summary>{t(lang, "excluded", { n: excluded.length })}</summary>
          <ul>
            {excluded.map((e) => (
              <li key={e.station.id}>{lang === "ja" ? e.station.ja : e.station.en}: {e.reasons.join("; ")}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
