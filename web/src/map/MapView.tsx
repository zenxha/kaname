/** Full-bleed MapLibre map: routes in line colors, numbered people, the 要 seal and the other stations. */
import { LngLatBounds, Map as MapLibreMap, type Marker, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState, type RefObject } from "react";
import type { LngLat } from "../model/geometry";
import { placeLabels, type Placement, type Rect } from "./labels";
import { addRouteLayers, BASEMAPS, blankStyle, setFocus } from "./layers";
import { personMarker, sealMarker, stationMarker } from "./markers";
import "./maplibreWorker";
import type { MapPerson, MapStation, Padding, Theme } from "./types";
import { useDrawIn } from "./useDrawIn";

/** Words the map needs, in the current language. */
export interface MapText {
  readonly label: string;
  readonly minutes: (n: number) => string;
  readonly whyHere: (station: string) => string;
  readonly showTrip: (who: string) => string;
  readonly showStation: (station: string, rank: number) => string;
}

interface Props {
  readonly theme: Theme;
  /** false: a plain background with no tile requests (tests and sandboxed previews). */
  readonly basemap: boolean;
  readonly text: MapText;
  readonly people: readonly MapPerson[];
  readonly meet: MapStation | null;
  readonly others: readonly MapStation[];
  readonly focus: string | null;
  /** Names the answer on show; a new one draws the lines in again. */
  readonly drawKey: string;
  /** The map refits only when this or the focus changes (a new answer, or a new sheet height). */
  readonly fitKey: string;
  readonly padding: Padding;
  readonly onPerson: (id: string) => void;
  readonly onStation: (id: string) => void;
  readonly onMeet: () => void;
}

const TOKYO: LngLat = [139.7671, 35.6812];
/** Other stations closer than this to the seal would cover it, so they hide. */
const CROWDED_PX = 30;
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Creates the map; falls back to a plain background if the basemap style cannot load. A failed tile is
 * not a failed style: only an error before the first load that names no source or tile switches over.
 */
function useMap(box: RefObject<HTMLDivElement | null>, theme: Theme, basemap: boolean): MapLibreMap | null {
  const [failedTheme, setFailedTheme] = useState<Theme | null>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  useEffect(() => {
    if (box.current === null) return;
    const blank = failedTheme === theme || !basemap;
    const style: string | StyleSpecification = blank ? blankStyle(theme) : BASEMAPS[theme];
    const m = new MapLibreMap({ container: box.current, style, center: [...TOKYO], zoom: 9.5,
      attributionControl: { compact: true }, dragRotate: false });
    m.touchZoomRotate.disableRotation();
    let live = true;
    let loaded = false;
    m.on("load", () => {
      loaded = true;
      if (!live) return;
      addRouteLayers(m, theme);
      setMap(m);
    });
    m.on("error", (e: object) => {
      if (live && !loaded && !blank && !("sourceId" in e) && !("tile" in e)) setFailedTheme(theme);
    });
    return () => {
      live = false;
      setMap(null);
      m.remove();
    };
  }, [box, theme, basemap, failedTheme]);
  return map;
}

/** An element's box in map pixels. */
function rectIn(el: Element, box: DOMRect): Rect {
  const r = el.getBoundingClientRect();
  return { left: r.left - box.left, top: r.top - box.top, right: r.right - box.left, bottom: r.bottom - box.top };
}

function showSpot(el: HTMLElement, spot: Placement): void {
  el.classList.toggle("flip", spot.startsWith("left"));
  el.classList.toggle("up", spot.endsWith("-up"));
  el.classList.toggle("down", spot.endsWith("-down"));
  el.classList.toggle("nolabel", spot === "hidden");
}

function fitPoints(people: readonly MapPerson[], meet: MapStation | null, focus: string | null): LngLat[] {
  const chosen = people.filter((p) => focus === null || p.id === focus);
  const shown = chosen.length > 0 ? chosen : people;
  const route = focus === null ? [] : shown.flatMap((p) => p.legs.flatMap((l) => l.path));
  return [...shown.flatMap((p) => [p.start, ...p.home.slice(-1)]), ...route, ...(meet ? [meet.at] : [])];
}

export function MapView(props: Props) {
  const { theme, basemap, text, people, meet, others, focus, drawKey, fitKey, onPerson, onStation, onMeet } = props;
  const box = useRef<HTMLDivElement>(null);
  const map = useMap(box, theme, basemap);
  const drawn = useRef("");
  const seal = useRef<HTMLElement | null>(null);
  const personEls = useRef(new Map<string, HTMLElement>());
  const stationEls = useRef<HTMLElement[]>([]);
  const declutterNow = useRef<(() => void) | null>(null);
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });

  useEffect(() => {
    if (map === null) return;
    const persons = people.map((p) => personMarker(p, text.minutes(p.minutes), text.showTrip(p.label), () => onPerson(p.id)));
    const stations = others.map((s) => stationMarker(s, text.showStation(s.name, s.rank), () => onStation(s.id)));
    const sealed = meet ? sealMarker(meet, text.whyHere(meet.name), drawn.current !== drawKey, onMeet) : null;
    const markers: Marker[] = [...stations.map((s) => s.marker), ...persons.map((p) => p.marker), ...(sealed ? [sealed.marker] : [])];
    markers.forEach((mk) => mk.addTo(map));
    personEls.current = new Map(persons.map((p, i) => [people[i]!.id, p.el]));
    stationEls.current = stations.map((s) => s.el);
    seal.current = sealed?.seal ?? null;
    const labels = persons.map((p) => p.el.querySelector<HTMLElement>(".mk-label")!);
    const sealEl = sealed?.marker.getElement() ?? null;
    const declutter = () => {
      const container = map.getContainer();
      const box = container.getBoundingClientRect();
      // The focused person's name goes first, then the list order.
      const first = latest.current.focus;
      const order = people.map((_, i) => i).sort((a, b) => Number(people[b]!.id === first) - Number(people[a]!.id === first));
      const items = order.map((i) => ({ at: map.project([...people[i]!.start]),
        size: { width: labels[i]!.offsetWidth, height: labels[i]!.offsetHeight } }));
      const sealBoxes = sealEl === null ? [] : [sealEl, ...sealEl.querySelectorAll(".mk-name")].map((el) => rectIn(el, box));
      const spots = placeLabels(items, sealBoxes, { width: container.clientWidth, height: container.clientHeight });
      order.forEach((i, k) => showSpot(persons[i]!.el, spots[k]!));
      if (meet === null) return;
      const c = map.project([...meet.at]);
      stations.forEach((s, i) => {
        const p = map.project([...others[i]!.at]);
        s.el.classList.toggle("crowded", Math.hypot(p.x - c.x, p.y - c.y) < CROWDED_PX);
      });
    };
    declutter();
    declutterNow.current = declutter;
    map.on("move", declutter);
    return () => {
      map.off("move", declutter);
      declutterNow.current = null;
      markers.forEach((mk) => mk.remove());
      seal.current = null;
    };
  }, [map, people, meet, others, text, drawKey, onPerson, onStation, onMeet]);

  useDrawIn(map, people, drawKey, drawn, seal, reducedMotion());

  useEffect(() => {
    if (map === null) return;
    setFocus(map, focus);
    personEls.current.forEach((el, id) => el.classList.toggle("dimmed", focus !== null && id !== focus));
    stationEls.current.forEach((el) => el.classList.toggle("hidden", focus !== null));
    declutterNow.current?.();
  }, [map, focus, people, others, meet, text, drawKey]);

  useEffect(() => {
    if (map === null) return;
    const { people: ps, meet: mt, focus: f, padding: pad } = latest.current;
    const pts = fitPoints(ps, mt, f);
    if (pts.length === 0) return;
    const bounds = pts.reduce((b, p) => b.extend([...p]), new LngLatBounds([...pts[0]!], [...pts[0]!]));
    map.fitBounds(bounds, { padding: pad, maxZoom: 14, duration: reducedMotion() ? 0 : 450 });
  }, [map, fitKey, focus]);

  return <div ref={box} className="map" role="region" aria-label={text.label} />;
}
