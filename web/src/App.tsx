import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppData } from "./data/load";
import { useAppData, useRouteBlocks } from "./data/useAppData";
import { MapView, OPENFREEMAP_DARK, type MapCandidate, type MapPerson } from "./components/MapView";
import { PersonCard } from "./components/PersonCard";
import { PersonEditor } from "./components/PersonEditor";
import { Controls, NextBest, ResultCard } from "./components/ResultPanel";
import { t, type Lang } from "./model/i18n";
import { personColor } from "./model/palette";
import { addPerson, DEFAULT_PEOPLE, removePerson, updatePerson, type Person } from "./model/scenario";
import { personSummary } from "./model/summary";
import { centre, hopStart, pathOrStraight, useOutcome, usePersonRoutes } from "./usePlan";

const PHONE = "(max-width: 760px)";

function usePhone(): boolean {
  const [phone, setPhone] = useState(() => window.matchMedia(PHONE).matches);
  useEffect(() => {
    const mq = window.matchMedia(PHONE);
    const on = () => setPhone(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return phone;
}

export function App() {
  const loaded = useAppData(import.meta.env.BASE_URL);
  const [lang, setLang] = useState<Lang>(() => (navigator.language.startsWith("ja") ? "ja" : "en"));
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  if (loaded.status !== "ready") {
    const msg = loaded.status === "loading" ? t(lang, "loading") : t(lang, "loadError", { msg: loaded.message });
    return <main className="notice" role={loaded.status === "error" ? "alert" : "status"}>{msg}</main>;
  }
  return <Planner data={loaded.data} lang={lang} setLang={setLang} />;
}

interface PlannerProps {
  readonly data: AppData;
  readonly lang: Lang;
  readonly setLang: (l: Lang) => void;
}

function Planner({ data, lang, setLang }: PlannerProps) {
  const m = data.matrix;
  const phone = usePhone();
  const basemap = new URLSearchParams(window.location.search).get("basemap") === "none" ? null : OPENFREEMAP_DARK;
  const [people, setPeople] = useState<readonly Person[]>(DEFAULT_PEOPLE);
  const [alpha, setAlpha] = useState(0.5);
  const [meetingEnd, setMeetingEnd] = useState<number | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const outcome = useOutcome(m, people, alpha, meetingEnd, selected);
  const best = outcome.kind === "ok" ? outcome.best : null;
  const k = best ? m.byId.get(best.station.id)! : null;
  const blocks = useRouteBlocks(data, k);
  const routes = usePersonRoutes(m, best, blocks);
  const active = people.filter((p) => p.start !== null);

  const mapPeople = useMemo<MapPerson[]>(() => (best ? best.people.map((p, j) => {
    const r = routes[j] ?? { out: [], home: [] };
    const idx = people.indexOf(active[j]!);
    return {
      number: idx + 1, color: personColor(idx),
      start: hopStart(m, r.out, p.startStation), home: centre(m, p.homeStation),
      out: pathOrStraight(m, r.out, p.startStation, best.station.id),
      back: pathOrStraight(m, r.home, best.station.id, p.homeStation),
      outMinutes: p.outMinutes, homeMinutes: p.homeMinutes,
    };
  }) : []), [best, routes, m, people, active]);
  const name = useCallback((s: { ja: string; en: string }) => (lang === "ja" ? s.ja : s.en), [lang]);
  const meet = useMemo<MapCandidate | null>(() => (best ? { id: best.station.id, rank: best.rank, at: centre(m, best.station.id), name: name(best.station) } : null), [best, m, name]);
  const others = useMemo<MapCandidate[]>(() => (outcome.kind === "ok" ? outcome.result.candidates.slice(0, 5)
    .filter((c) => c.station.id !== best?.station.id)
    .map((c) => ({ id: c.station.id, rank: c.rank, at: centre(m, c.station.id), name: name(c.station) })) : []), [outcome, best, m, name]);
  const minutesLabel = useCallback((n: number) => t(lang, "minutes", { n }), [lang]);
  const padding = useMemo(() => (phone ? { top: 40, bottom: 30, left: 30, right: 30 } : { top: 60, bottom: 60, left: 350, right: 320 }), [phone]);
  const change = (people: readonly Person[]) => {
    setPeople(people);
    setSelected(null);
  };

  const maxTotal = best ? Math.max(...best.people.map((p) => p.outMinutes + p.homeMinutes)) : 1;
  return (
    <div className="app">
      <MapView basemap={basemap} people={mapPeople} meet={meet} others={others} minutesLabel={minutesLabel} onSelect={setSelected} padding={padding} />
      <aside className="column left" aria-label={t(lang, "people", { n: people.length })}>
        <header className="card brand">
          <span className="brand-name"><b>Kaname</b><span>要</span></span>
          <span className="lang">
            <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button>
            <button type="button" aria-pressed={lang === "ja"} onClick={() => setLang("ja")} style={{ fontFamily: "var(--sans)" }}>日本語</button>
          </span>
        </header>
        <h2 className="label people-label">{t(lang, "people", { n: people.length })}</h2>
        {people.map((p, i) => {
          const j = active.indexOf(p);
          const result = j >= 0 ? best?.people[j] : undefined;
          const snap = outcome.kind === "ok" && j >= 0 ? outcome.result.participants[j]?.start[0] : undefined;
          return editing === p.id ? (
            <PersonEditor key={p.id} data={m} lang={lang} person={p} index={i} color={personColor(i)} startSnap={snap}
              onChange={(c) => change(updatePerson(people, p.id, c))}
              onRemove={() => { change(removePerson(people, p.id)); setEditing(null); }}
              onDone={() => setEditing(null)} />
          ) : (
            <PersonCard key={p.id} data={m} lang={lang} index={i} color={personColor(i)} label={p.label || `#${i + 1}`}
              meet={best ? name(best.station) : "—"} result={result}
              summary={result ? personSummary(result, meetingEnd) : undefined}
              outHops={routes[j]?.out ?? []} homeHops={routes[j]?.home ?? []} maxTotal={maxTotal}
              onEdit={() => setEditing(p.id)} />
          );
        })}
        <button type="button" className="add" onClick={() => {
          const next = addPerson(people, "");
          change(next);
          setEditing(next.at(-1)!.id);
        }}>{t(lang, "addPerson")}</button>
      </aside>
      <aside className="column right" aria-label={t(lang, "meetAt")}>
        {outcome.kind === "needTwo" && <p className="card notice">{t(lang, "needTwo")}</p>}
        {outcome.kind === "error" && <p className="card notice" role="alert">{outcome.message}</p>}
        {outcome.kind === "ok" && best === null && <p className="card notice" role="alert">{t(lang, "noFeasible")}</p>}
        {best && <ResultCard lang={lang} best={best} />}
        {outcome.kind === "ok" && outcome.result.candidates.length > 1 && (
          <NextBest lang={lang} candidates={outcome.result.candidates} selected={best?.station.id ?? ""} onSelect={setSelected} />
        )}
        <Controls lang={lang} alpha={alpha} meetingEnd={meetingEnd}
          excluded={outcome.kind === "ok" ? outcome.result.excluded : []}
          onAlpha={(a) => { setAlpha(a); setSelected(null); }}
          onMeetingEnd={(e) => { setMeetingEnd(e); setSelected(null); }} />
      </aside>
      <footer className="attribution">{t(lang, "attribution")}</footer>
    </div>
  );
}
