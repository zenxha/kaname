/** The efficient-to-fair slider with a note on what it means, and the meeting end. */
import { useId } from "react";
import { formatClock, parseClock } from "../../core/time";
import type { Exclusion } from "../../core/types";
import { alphaNote, t, type Lang } from "../model/i18n";

interface Props {
  readonly lang: Lang;
  readonly alpha: number;
  readonly meetingEnd: number | null;
  readonly excluded: readonly Exclusion[];
  readonly onAlpha: (alpha: number) => void;
  readonly onMeetingEnd: (end: number | null) => void;
}

/** Left is efficient (alpha 1), right is fair (alpha 0). */
export function Controls({ lang, alpha, meetingEnd, excluded, onAlpha, onMeetingEnd }: Props) {
  const sliderId = useId();
  const endId = useId();
  const fair = Math.round((1 - alpha) * 100);
  return (
    <section className="controls">
      <div className="ctl">
        <label htmlFor={sliderId} className="sub">{t(lang, "alphaLabel")}</label>
        <div className="ends" aria-hidden="true"><span>{t(lang, "efficient")}</span><span>{t(lang, "fair")}</span></div>
        <input id={sliderId} className="slider" type="range" min={0} max={100} value={fair}
          aria-valuetext={`${t(lang, "fair")} ${fair}%`} onChange={(e) => onAlpha(1 - Number(e.target.value) / 100)} />
        <p className="note">{t(lang, alphaNote(alpha))}</p>
      </div>
      <div className="ctl">
        <label htmlFor={endId} className="sub">{t(lang, "meetingEnds")}</label>
        <div className="end-row">
          <input id={endId} className="input" type="time" value={meetingEnd === null ? "" : formatClock(meetingEnd)}
            onChange={(e) => onMeetingEnd(e.target.value ? parseClock(e.target.value) : null)} />
          {meetingEnd !== null && <button type="button" className="btn" onClick={() => onMeetingEnd(null)}>{t(lang, "clearEnd")}</button>}
        </div>
        {meetingEnd !== null && excluded.length > 0 && (
          <details className="excluded">
            <summary>{t(lang, "excluded", { n: excluded.length })}</summary>
            <ul>
              {excluded.map((e) => <li key={e.station.id}>{lang === "ja" ? e.station.ja : e.station.en}: {e.reasons.join("; ")}</li>)}
            </ul>
          </details>
        )}
      </div>
    </section>
  );
}
