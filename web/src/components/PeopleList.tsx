/** The people: rows that open into a trip, one editor at a time, and the add button. Focus follows the editor. */
import { useEffect, useRef, useState } from "react";
import type { MatrixData } from "../../core/data";
import { t, type Lang } from "../model/i18n";
import { addPerson, removePerson, updatePerson, type Person } from "../model/scenario";
import { scoredIndexes, stationIndex, type Outcome, type PersonRoute } from "../usePlan";
import { PersonEditor } from "./PersonEditor";
import { PersonRow } from "./PersonRow";

interface Props {
  readonly data: MatrixData;
  readonly lang: Lang;
  readonly people: readonly Person[];
  readonly outcome: Outcome;
  readonly routes: readonly PersonRoute[];
  readonly meetingEnd: number | null;
  /** The person whose trip is open, by id. */
  readonly open: string | null;
  readonly onOpen: (id: string) => void;
  readonly edit: (update: (prev: readonly Person[]) => readonly Person[], movesSomeone: boolean) => void;
}

export function PeopleList({ data, lang, people, outcome, routes, meetingEnd, open, onOpen, edit }: Props) {
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
  const meet = best ? stationIndex(data, best.station.id) : -1;
  const slots = scoredIndexes(people);
  const addOne = () => {
    const id = addPerson(people, "").at(-1)!.id;
    edit((prev) => addPerson(prev, ""), true);
    setEditing(id);
  };

  return (
    <section className="people" aria-label={t(lang, "people", { n: people.length })}>
      <h2 className="sub">{t(lang, "people", { n: people.length })}</h2>
      <ol className="prows">
        {people.map((p, i) => {
          const j = slots.indexOf(i);
          const label = p.label.trim() || `#${i + 1}`;
          if (editing === p.id) {
            const snap = outcome.kind === "ok" && j >= 0 ? outcome.result.participants[j]?.start[0] : undefined;
            return (
              <li key={p.id} className="prow editing">
                <PersonEditor data={data} lang={lang} person={p} index={i} startSnap={snap}
                  onChange={(c) => edit((prev) => updatePerson(prev, p.id, c), "start" in c || "home" in c)}
                  onRemove={() => { edit((prev) => removePerson(prev, p.id), true); setEditing(null); setFocus("add"); }}
                  onDone={() => { setEditing(null); setFocus(p.id); }} />
              </li>
            );
          }
          return (
            <PersonRow key={p.id} id={p.id} data={data} lang={lang} number={i + 1} label={label}
              result={j >= 0 ? best?.people[j] : undefined} hops={routes[j]?.out ?? []} meet={meet} meetingEnd={meetingEnd}
              open={open === p.id} onOpen={() => onOpen(p.id)} onEdit={() => setEditing(p.id)} />
          );
        })}
      </ol>
      <button ref={addRef} type="button" className="add" onClick={addOne}>{t(lang, "addPerson")}</button>
    </section>
  );
}
