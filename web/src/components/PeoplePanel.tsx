import { useEffect, useRef, useState } from "react";
import type { MatrixData } from "../../core/data";
import { t, type Lang } from "../model/i18n";
import { personColor } from "../model/palette";
import { addPerson, removePerson, updatePerson, type Person } from "../model/scenario";
import { personSummary } from "../model/summary";
import { scoredIndexes, type Outcome, type PersonRoute } from "../usePlan";
import { PersonCard } from "./PersonCard";
import { PersonEditor } from "./PersonEditor";

interface Props {
  readonly data: MatrixData;
  readonly lang: Lang;
  readonly people: readonly Person[];
  readonly outcome: Outcome;
  readonly routes: readonly PersonRoute[];
  readonly meetingEnd: number | null;
  readonly edit: (update: (prev: readonly Person[]) => readonly Person[], movesSomeone: boolean) => void;
}

/** The people cards; one at a time opens as an editor. Focus follows the open and close. */
export function PeoplePanel({ data, lang, people, outcome, routes, meetingEnd, edit }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (focus === null) return;
    const target = focus === "add" ? addRef.current : document.querySelector<HTMLElement>(`[data-person="${focus}"]`);
    target?.focus();
    setFocus(null);
  }, [focus]);

  const best = outcome.kind === "ok" ? outcome.best : null;
  const slots = scoredIndexes(people);
  const maxTotal = best ? Math.max(1, ...best.people.map((p) => p.outMinutes + p.homeMinutes)) : 1;
  const meetName = best ? (lang === "ja" ? best.station.ja : best.station.en) : "—";
  const addOne = () => {
    const id = addPerson(people, "").at(-1)!.id;
    edit((prev) => addPerson(prev, ""), true);
    setEditing(id);
  };

  return (
    <>
      <h2 className="label people-label">{t(lang, "people", { n: people.length })}</h2>
      {people.map((p, i) => {
        const j = slots.indexOf(i);
        const result = j >= 0 ? best?.people[j] : undefined;
        const label = p.label.trim() || `#${i + 1}`;
        if (editing === p.id) {
          const snap = outcome.kind === "ok" && j >= 0 ? outcome.result.participants[j]?.start[0] : undefined;
          return (
            <PersonEditor key={p.id} data={data} lang={lang} person={p} index={i} color={personColor(i)} startSnap={snap}
              onChange={(c) => edit((prev) => updatePerson(prev, p.id, c), "start" in c || "home" in c)}
              onRemove={() => { edit((prev) => removePerson(prev, p.id), true); setEditing(null); setFocus("add"); }}
              onDone={() => { setEditing(null); setFocus(p.id); }} />
          );
        }
        return (
          <PersonCard key={p.id} id={p.id} data={data} lang={lang} index={i} color={personColor(i)} label={label}
            meet={meetName} result={result} summary={result ? personSummary(result, meetingEnd) : undefined}
            outHops={routes[j]?.out ?? []} homeHops={routes[j]?.home ?? []} maxTotal={maxTotal}
            onEdit={() => setEditing(p.id)} />
        );
      })}
      <button ref={addRef} type="button" className="add" onClick={addOne}>{t(lang, "addPerson")}</button>
    </>
  );
}
