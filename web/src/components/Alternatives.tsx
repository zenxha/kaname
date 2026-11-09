/** The top five stations. When the ranking changes, rows slide to their new places. */
import { useLayoutEffect, useRef } from "react";
import type { CandidateResult } from "../../core/types";
import { t, type Lang } from "../model/i18n";
import { plainSummary } from "../model/compare";

interface Props {
  readonly lang: Lang;
  readonly candidates: readonly CandidateResult[];
  readonly selected: string;
  readonly onSelect: (id: string) => void;
}

export const SHOWN = 5;
const REORDER = { duration: 220, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" };

/** Slides each row from where it was to where it is now (positions inside the list, so a moving sheet does not count). */
function useReorder() {
  const list = useRef<HTMLOListElement>(null);
  const tops = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const rows = [...(list.current?.querySelectorAll<HTMLElement>("li[data-id]") ?? [])];
    const now = new Map(rows.map((li) => [li.dataset.id!, li.offsetTop]));
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!still) {
      for (const li of rows) {
        const was = tops.current.get(li.dataset.id!);
        const dy = was === undefined ? 0 : was - now.get(li.dataset.id!)!;
        if (Math.abs(dy) >= 1) li.animate?.([{ transform: `translateY(${dy}px)` }, { transform: "none" }], REORDER);
      }
    }
    tops.current = now;
  });
  return list;
}

export function Alternatives({ lang, candidates, selected, onSelect }: Props) {
  const list = useReorder();
  return (
    <section className="others">
      <h2 className="sub">{t(lang, "others")}</h2>
      <ol ref={list}>
        {candidates.slice(0, SHOWN).map((c) => (
          <li key={c.station.id} data-id={c.station.id}>
            <button type="button" aria-current={c.station.id === selected} onClick={() => onSelect(c.station.id)}>
              <span className="rank">{c.rank}</span>
              <span className="name">{c.station.ja}<small>{c.station.en}</small></span>
              <span className="nums">{t(lang, "avgLongest", { avg: Math.round(plainSummary(c).average), worst: plainSummary(c).longest.minutes })}</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
