/** The efficient-to-fair slider, with a note on what its position means. */
import { useId } from "react";
import { alphaNote, t, type Lang } from "../model/i18n";

interface Props {
  readonly lang: Lang;
  readonly alpha: number;
  readonly onAlpha: (alpha: number) => void;
}

/** Left is efficient (alpha 1), right is fair (alpha 0). */
export function Controls({ lang, alpha, onAlpha }: Props) {
  const sliderId = useId();
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
    </section>
  );
}
