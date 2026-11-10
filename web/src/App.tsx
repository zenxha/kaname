import { useCallback, useEffect, useMemo, useState } from "react";
import { Alternatives, SHOWN } from "./components/Alternatives";
import { Controls } from "./components/Controls";
import { PeopleList } from "./components/PeopleList";
import { StationSearchContext } from "./components/searchContext";
import { Sheet } from "./components/Sheet";
import { Ticket } from "./components/Ticket";
import type { AppData } from "./data/load";
import { useAppData, useRouteBlocks } from "./data/useAppData";
import { MapView, type MapText } from "./map/MapView";
import type { MapStation, Padding } from "./map/types";
import { STRINGS, t, type Lang } from "./model/i18n";
import { problemText } from "./model/problem";
import { isExample, type Person } from "./model/scenario";
import { planOf } from "./model/share";
import { visibleHeight, type Snap } from "./model/sheet";
import { buildMapPeople, fitKey, personRoutes, scoredIndexes, stationIndex, toMapStation, useOutcome } from "./usePlan";
import { useStacked, useTheme, useViewportHeight } from "./useScreen";
import { readOpening, useLinkSync, useShare } from "./useShareLink";

/** The loading screen from index.html, kept on screen while the data loads, so nothing jumps. */
function Boot() {
  return (
    <main className="boot" role="status">
      <span className="boot-seal" aria-hidden="true">要</span>
      <p className="boot-name">Kaname</p>
      <p className="boot-msg">{STRINGS.en.loading}<br /><span lang="ja">{STRINGS.ja.loading}</span></p>
    </main>
  );
}

export function App() {
  const loaded = useAppData(import.meta.env.BASE_URL);
  const [lang, setLang] = useState<Lang>(() => (navigator.language.startsWith("ja") ? "ja" : "en"));
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  if (loaded.status === "loading") return <Boot />;
  if (loaded.status === "error") return <main className="notice-page" role="alert">{t(lang, "loadError", { msg: loaded.message })}</main>;
  return <Planner data={loaded.data} lang={lang} setLang={setLang} />;
}

interface PlannerProps {
  readonly data: AppData;
  readonly lang: Lang;
  readonly setLang: (l: Lang) => void;
}

/** `?basemap=none` (tests) or a build with VITE_BASEMAP=none (sandboxed previews that block tile hosts). */
const BASEMAP = !(new URLSearchParams(window.location.search).get("basemap") === "none" || import.meta.env.VITE_BASEMAP === "none");
/** Map space the brand bar and the station labels need, beside the sheet or panel. */
const PHONE_PAD = { top: 64, left: 28, right: 96 };
const DESKTOP_PAD = { top: 60, bottom: 60, left: 440, right: 120 };

function useMapText(lang: Lang): MapText {
  return useMemo(() => ({
    label: t(lang, "mapLabel"),
    minutes: (n: number) => t(lang, "minutes", { n }),
    whyHere: (station: string) => t(lang, "whyHere", { station }),
    showTrip: (who: string) => t(lang, "showTrip", { who }),
    showStation: (station: string, n: number) => t(lang, "showStation", { station, n }),
  }), [lang]);
}

function Planner({ data, lang, setLang }: PlannerProps) {
  const m = data.matrix;
  const stacked = useStacked();
  const theme = useTheme();
  const viewport = useViewportHeight();
  const [opening] = useState(() => readOpening(m, window.location.search));
  const [people, setPeople] = useState<readonly Person[]>(opening.people);
  const [alpha, setAlpha] = useState(opening.alpha);
  const [selected, setSelected] = useState<string | null>(opening.selected);
  const [focus, setFocus] = useState<string | null>(null);
  const [snap, setSnap] = useState<Snap>("peek");

  const unnamed = useCallback((n: number) => t(lang, "personN", { n }), [lang]);
  const outcome = useOutcome(m, people, alpha, selected, unnamed);
  const result = outcome.kind === "ok" ? outcome.result : null;
  const best = outcome.kind === "ok" ? outcome.best : null;
  const first = result?.candidates[0] ?? null;
  const blocks = useRouteBlocks(data, best ? stationIndex(m, best.station.id) : null);
  const routes = useMemo(() => personRoutes(m, best, blocks.blocks), [m, best, blocks.blocks]);
  const mapPeople = useMemo(() => buildMapPeople(m, best, routes, people, blocks.error, data.shapes),
    [m, best, routes, people, blocks.error, data.shapes]);
  const name = useCallback((s: { readonly ja: string; readonly en: string }) => (lang === "ja" ? s.ja : s.en), [lang]);
  const meet = useMemo<MapStation | null>(() => (best ? toMapStation(m, best, best.station.ja) : null), [best, m]);
  const others = useMemo<MapStation[]>(() => (result ? result.candidates.slice(0, SHOWN)
    .filter((c) => c.station.id !== best?.station.id).map((c) => toMapStation(m, c, name(c.station))) : []), [result, best, m, name]);
  const mapText = useMapText(lang);
  const plan = useMemo(() => {
    const slots = scoredIndexes(people);
    const participants = outcome.kind === "ok" ? outcome.result.participants : [];
    const snapped = (i: number, which: "start" | "home") => participants[slots.indexOf(i)]?.[which][0]?.station.id ?? null;
    return planOf(people, snapped, alpha, selected);
  }, [people, outcome, alpha, selected]);
  const untouched = isExample(people) && alpha === 0.5 && selected === null;
  useLinkSync(plan, untouched);
  const { share, toast } = useShare(lang, best ? name(best.station) : null);
  const fromLink = opening.shared && people === opening.people;
  const search = useMemo(() => ({ kana: data.kana, base: data.base }), [data.kana, data.base]);
  /** With no answer to show, the sheet opens far enough to edit the people. */
  const sheetSnap: Snap = best === null && snap === "peek" ? "half" : snap;
  const padding = useMemo<Padding>(() => (stacked
    ? { ...PHONE_PAD, bottom: visibleHeight(sheetSnap === "full" ? "half" : sheetSnap, viewport) + 16 }
    : DESKTOP_PAD), [stacked, sheetSnap, viewport]);

  const raise = useCallback(() => setSnap((s) => (s === "peek" ? "half" : s)), []);
  const openPerson = useCallback((id: string) => {
    setFocus((f) => (f === id ? null : id));
    raise();
  }, [raise]);
  const pick = useCallback((id: string) => {
    setSelected(id);
    setFocus(null);
  }, []);
  /** Every edit works on the latest state; a change of who goes where drops the hand-picked station. */
  const edit = useCallback((update: (prev: readonly Person[]) => readonly Person[], movesSomeone: boolean) => {
    setPeople(update);
    if (movesSomeone) {
      setSelected(null);
      setFocus(null);
    }
  }, []);
  const reset = () => {
    setSelected(null);
    setFocus(null);
  };

  return (
    <StationSearchContext value={search}>
    <div className="app">
      <MapView theme={theme} basemap={BASEMAP} text={mapText} people={mapPeople} meet={meet} others={others}
        focus={focus} drawKey={fitKey(best)} fitKey={`${fitKey(best)}|${stacked ? sheetSnap : "panel"}`} padding={padding}
        onPerson={openPerson} onStation={pick} onMeet={raise} />
      <p className="toast" role="status">{toast ?? ""}</p>
      <header className="topbar">
        <span className="brand"><i aria-hidden="true">要</i>Kaname</span>
        <span className="topbar-end">
          {isExample(people) && <span className="example-tag">{t(lang, "example")}</span>}
          {fromLink && <span className="example-tag">{t(lang, "sharedPlan")}</span>}
          <span className="lang">
            <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button>
            <button type="button" aria-pressed={lang === "ja"} onClick={() => setLang("ja")}>日本語</button>
          </span>
        </span>
      </header>
      <Sheet stacked={stacked} snap={sheetSnap} viewport={viewport} onSnap={setSnap} label={t(lang, "result")}
        moreLabel={t(lang, "showMore")} lessLabel={t(lang, "showLess")} head={<>
          {outcome.kind === "needTwo" && <p className="notice">{t(lang, "needTwo")}</p>}
          {outcome.kind === "error" && <p className="notice" role="alert">{problemText(lang, outcome.error, m.windows)}</p>}
          {outcome.kind === "ok" && best === null && <p className="notice" role="alert">{t(lang, "noFeasible")}</p>}
          {blocks.error && <p className="notice" role="alert">{t(lang, "routesError")}</p>}
          {fromLink && opening.unknown > 0 && <p className="notice" role="alert">{t(lang, "unknownStations", { n: opening.unknown })}</p>}
          {best && first && <Ticket lang={lang} shown={best} first={first} onOpen={raise} onShare={share} />}
        </>}>
        <PeopleList data={m} lang={lang} people={people} outcome={outcome} routes={routes}
          open={focus} onOpen={openPerson} edit={edit} />
        {result && result.candidates.length > 1 && (
          <Alternatives lang={lang} candidates={result.candidates} selected={best?.station.id ?? ""} onSelect={pick} />
        )}
        <Controls lang={lang} alpha={alpha} onAlpha={(a) => { setAlpha(a); reset(); }} />
        <footer className="attribution">{t(lang, "attribution")}</footer>
      </Sheet>
    </div>
    </StationSearchContext>
  );
}
