import { useCallback, useEffect, useMemo, useState } from "react";
import { MapView, OPENFREEMAP_DARK, type MapCandidate } from "./components/MapView";
import { PeoplePanel } from "./components/PeoplePanel";
import { Controls, NextBest, ResultCard } from "./components/ResultPanel";
import type { AppData } from "./data/load";
import { useAppData, useRouteBlocks } from "./data/useAppData";
import { t, type Lang } from "./model/i18n";
import { DEFAULT_PEOPLE, type Person } from "./model/scenario";
import { buildMapPeople, fitKey, personRoutes, stationIndex, toMapCandidate, useOutcome } from "./usePlan";

/** Below this width the cards stack under the map (the floating columns need about 1000 px). */
const STACKED = "(max-width: 900px)";

function useStacked(): boolean {
  const [stacked, setStacked] = useState(() => window.matchMedia(STACKED).matches);
  useEffect(() => {
    const mq = window.matchMedia(STACKED);
    const on = () => setStacked(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return stacked;
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

/** `?basemap=none` (tests) or a build with VITE_BASEMAP=none (sandboxed previews that block tile hosts). */
const BASEMAP = new URLSearchParams(window.location.search).get("basemap") === "none" || import.meta.env.VITE_BASEMAP === "none"
  ? null : OPENFREEMAP_DARK;

function Planner({ data, lang, setLang }: PlannerProps) {
  const m = data.matrix;
  const stacked = useStacked();
  const [people, setPeople] = useState<readonly Person[]>(DEFAULT_PEOPLE);
  const [alpha, setAlpha] = useState(0.5);
  const [meetingEnd, setMeetingEnd] = useState<number | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const outcome = useOutcome(m, people, alpha, meetingEnd, selected);
  const best = outcome.kind === "ok" ? outcome.best : null;
  const blocks = useRouteBlocks(data, best ? stationIndex(m, best.station.id) : null);
  const routes = useMemo(() => personRoutes(m, best, blocks.blocks), [m, best, blocks.blocks]);
  const mapPeople = useMemo(() => buildMapPeople(m, best, routes, people), [m, best, routes, people]);
  const name = useCallback((s: { readonly ja: string; readonly en: string }) => (lang === "ja" ? s.ja : s.en), [lang]);
  const meet = useMemo<MapCandidate | null>(() => (best ? toMapCandidate(m, best, name(best.station)) : null), [best, m, name]);
  const others = useMemo<MapCandidate[]>(() => (outcome.kind === "ok" ? outcome.result.candidates.slice(0, 5)
    .filter((c) => c.station.id !== best?.station.id).map((c) => toMapCandidate(m, c, name(c.station))) : []), [outcome, best, m, name]);
  const minutesLabel = useCallback((n: number) => t(lang, "minutes", { n }), [lang]);
  const padding = useMemo(() => (stacked ? { top: 40, bottom: 30, left: 30, right: 30 } : { top: 60, bottom: 60, left: 350, right: 320 }), [stacked]);

  /** Every edit works on the latest state; a change of who goes where drops the hand-picked station. */
  const edit = useCallback((update: (prev: readonly Person[]) => readonly Person[], movesSomeone: boolean) => {
    setPeople(update);
    if (movesSomeone) setSelected(null);
  }, []);

  return (
    <div className="app">
      <MapView basemap={BASEMAP} label={t(lang, "mapLabel")} people={mapPeople} meet={meet} others={others}
        minutesLabel={minutesLabel} onSelect={setSelected} fitKey={fitKey(best)} padding={padding} />
      <aside className="column left" aria-label={t(lang, "people", { n: people.length })}>
        <header className="card brand">
          <span className="brand-name"><b>Kaname</b><span>要</span></span>
          <span className="lang">
            <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button>
            <button type="button" aria-pressed={lang === "ja"} onClick={() => setLang("ja")} style={{ fontFamily: "var(--sans)" }}>日本語</button>
          </span>
        </header>
        <PeoplePanel data={m} lang={lang} people={people} outcome={outcome} routes={routes} meetingEnd={meetingEnd} edit={edit} />
      </aside>
      <aside className="column right" aria-label={t(lang, "meetAt")}>
        {outcome.kind === "needTwo" && <p className="card notice">{t(lang, "needTwo")}</p>}
        {outcome.kind === "error" && <p className="card notice" role="alert">{outcome.message}</p>}
        {outcome.kind === "ok" && best === null && <p className="card notice" role="alert">{t(lang, "noFeasible")}</p>}
        {blocks.error && <p className="card notice" role="alert">{t(lang, "routesError")}</p>}
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
