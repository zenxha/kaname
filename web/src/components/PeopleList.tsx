/** The people: rows that open into a trip, one editor at a time, and the add button. Focus follows the editor. */
import { useEffect, useId, useRef, useState } from "react";
import type { MatrixData } from "../../core/data";
import { MAX_PARTICIPANTS } from "../../core/participants";
import { earliestLastTrain } from "../model/compare";
import { t, type Lang } from "../model/i18n";
import { addPerson, canAddPerson, isExample, removePerson, updatePerson, visibleName, type Person } from "../model/scenario";
import { scoredIndexes, stationIndex, type Outcome, type PersonRoute } from "../usePlan";
import { PersonEditor } from "./PersonEditor";
import { PersonRow } from "./PersonRow";

interface Props {
  readonly data: MatrixData;
  readonly lang: Lang;
  readonly people: readonly Person[];
  readonly outcome: Outcome;
  readonly routes: readonly PersonRoute[];
  /** The person whose trip is open, by id. */
  readonly open: string | null;
  readonly onOpen: (id: string) => void;
  readonly edit: (update: (prev: readonly Person[]) => readonly Person[], movesSomeone: boolean) => void;
}

export function PeopleList({ data, lang, people, outcome, routes, open, onOpen, edit }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const headingId = useId();
  useEffect(() => {
    if (focus === null) return;
    const target = focus === "add" ? addRef.current : document.querySelector<HTMLElement>(`[data-person="${focus}"]`);
    target?.focus();
    setFocus(null);
  }, [focus]);

  const best = outcome.kind === "ok" ? outcome.best : null;
  const meet = best ? stationIndex(data, best.station.id) : -1;
  const leaveFirst = best ? earliestLastTrain(best)?.time ?? null : null;
  const slots = scoredIndexes(people);
  const addOne = () => {
    const id = addPerson(people, "").at(-1)!.id;
    edit((prev) => addPerson(prev, ""), true);
    setEditing(id);
  };
  /** Replaces the example with one empty person, whose editor opens. */
  const startOwn = () => {
    const fresh = addPerson([], "");
    edit(() => fresh, true);
    setEditing(fresh[0]!.id);
  };

  return (
    <section className="people" aria-labelledby={headingId}>
      <div className="people-head">
        <h2 className="sub" id={headingId}>{t(lang, "people", { n: people.length })}</h2>
        {isExample(people) && <button type="button" className="t-why" onClick={startOwn}>{t(lang, "startOwn")}</button>}
      </div>
      <ol className="prows">
        {people.map((p, i) => {
          const j = slots.indexOf(i);
          const label = visibleName(p.label) || t(lang, "personN", { n: i + 1 });
          if (editing === p.id) {
            const snap = outcome.kind === "ok" && j >= 0 ? outcome.result.participants[j]?.start[0] : undefined;
            return (
              <li key={p.id} className="prow editing">
                <PersonEditor data={data} lang={lang} person={p} index={i} startSnap={snap}
                  onChange={(c) => edit((prev) => updatePerson(prev, p.id, c), "start" in c || "home" in c)}
                  onRemove={() => { edit((prev) => removePerson(prev, p.id), true); setEditing(null); setFocus("add"); }}
                  onDone={() => { setEditing(null); setFocus(p.id); }}
                  onDismiss={() => setEditing(null)} />
              </li>
            );
          }
          return (
            <PersonRow key={p.id} id={p.id} data={data} lang={lang} number={i + 1} label={label}
              result={j >= 0 ? best?.people[j] : undefined} hops={routes[j]?.out ?? []} meet={meet} first={leaveFirst !== null && best?.people[j]?.lastDeparture === leaveFirst}
              open={open === p.id} onOpen={() => onOpen(p.id)} onEdit={() => setEditing(p.id)} />
          );
        })}
      </ol>
      {canAddPerson(people)
        ? <button ref={addRef} type="button" className="add" onClick={addOne}>{t(lang, "addPerson")}</button>
        : <p className="snap" role="status">{t(lang, "maxPeople", { n: MAX_PARTICIPANTS })}</p>}
    </section>
  );
}
