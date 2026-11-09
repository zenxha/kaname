/** Full-bleed MapLibre map: routes, start and home markers, time chips, meeting and candidate markers. */
import type { FeatureCollection } from "geojson";
import { LngLatBounds, Map as MapLibreMap, Marker, type GeoJSONSource, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./maplibreWorker";
import { useEffect, useRef } from "react";
import type { LngLat } from "../model/geometry";

export interface MapPerson {
  readonly number: number;
  readonly color: string;
  readonly start: LngLat;
  readonly home: LngLat;
  readonly out: readonly LngLat[];
  readonly back: readonly LngLat[];
  readonly outMinutes: number;
  readonly homeMinutes: number;
}

export interface MapCandidate {
  readonly id: string;
  readonly rank: number;
  readonly at: LngLat;
  readonly name: string;
}

interface Props {
  readonly basemap: string | null;
  readonly people: readonly MapPerson[];
  readonly meet: MapCandidate | null;
  readonly others: readonly MapCandidate[];
  readonly minutesLabel: (n: number) => string;
  readonly onSelect: (id: string) => void;
  /** Space the floating cards cover, so fitBounds keeps the routes visible. */
  readonly padding: { top: number; bottom: number; left: number; right: number };
}

const OPENFREEMAP_DARK = "https://tiles.openfreemap.org/styles/dark";
const TOKYO: LngLat = [139.7671, 35.6812];
const BLANK: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "bg", type: "background", paint: { "background-color": "#0A0C10" } }],
};

function lineFeatures(people: readonly MapPerson[], key: "out" | "back"): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: people
      .filter((p) => p[key].length > 1)
      .map((p) => ({
        type: "Feature",
        properties: { color: p.color },
        geometry: { type: "LineString", coordinates: p[key].map(([x, y]) => [x, y]) },
      })),
  };
}

function el(className: string, text = "", style: Partial<CSSStyleDeclaration> = {}): HTMLElement {
  const node = document.createElement("div");
  node.className = className;
  node.textContent = text;
  Object.assign(node.style, style);
  return node;
}

function midpoint(path: readonly LngLat[]): LngLat | null {
  return path.length === 0 ? null : path[Math.floor(path.length / 2)]!;
}

function addRouteLayers(map: MapLibreMap): void {
  map.addSource("out", { type: "geojson", data: lineFeatures([], "out") });
  map.addSource("back", { type: "geojson", data: lineFeatures([], "back") });
  map.addLayer({ id: "back", type: "line", source: "back", layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": ["get", "color"], "line-width": 4, "line-opacity": 0.85, "line-dasharray": [0.6, 1.8] } });
  map.addLayer({ id: "out", type: "line", source: "out", layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": ["get", "color"], "line-width": 5 } });
}

function personMarkers(p: MapPerson, minutesLabel: (n: number) => string, delay: number): Marker[] {
  const start = el("mk-start pop", String(p.number), { background: p.color, animationDelay: `${delay}s` });
  const home = el("mk-home pop", "", { borderColor: p.color, animationDelay: `${delay + 0.6}s` });
  const markers = [new Marker({ element: start }).setLngLat([...p.start])];
  if (p.homeMinutes > 0) markers.push(new Marker({ element: home }).setLngLat([...p.home]));
  const outMid = midpoint(p.out);
  if (outMid && p.outMinutes > 0) {
    const chip = el("mk-chip pop", minutesLabel(p.outMinutes), { borderColor: p.color, animationDelay: `${delay + 0.3}s` });
    markers.push(new Marker({ element: chip }).setLngLat([...outMid]));
  }
  const backMid = midpoint(p.back);
  if (backMid && p.homeMinutes > 0) {
    const chip = el("mk-chip home pop", minutesLabel(p.homeMinutes), { borderColor: p.color, animationDelay: `${delay + 0.6}s` });
    markers.push(new Marker({ element: chip }).setLngLat([...backMid]));
  }
  return markers;
}

function meetMarker(meet: MapCandidate): Marker {
  const node = el("mk-meet");
  node.append(el("ring"), el("core", "要"), el("name", meet.name));
  return new Marker({ element: node }).setLngLat([...meet.at]);
}

function candidateMarker(c: MapCandidate, onSelect: (id: string) => void): Marker {
  const node = document.createElement("button");
  node.type = "button";
  node.className = "mk-cand";
  node.textContent = String(c.rank);
  node.setAttribute("aria-label", c.name);
  node.addEventListener("click", () => onSelect(c.id));
  return new Marker({ element: node }).setLngLat([...c.at]);
}

export function MapView({ basemap, people, meet, others, minutesLabel, onSelect, padding }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const ready = useRef<Promise<void> | null>(null);

  useEffect(() => {
    if (box.current === null) return;
    const m = new MapLibreMap({
      container: box.current,
      style: basemap ?? BLANK,
      center: [...TOKYO],
      zoom: 9.5,
      attributionControl: { compact: true },
      dragRotate: false,
    });
    m.touchZoomRotate.disableRotation();
    map.current = m;
    ready.current = new Promise((resolve) => m.on("load", () => {
      addRouteLayers(m);
      resolve();
    }));
    return () => {
      m.remove();
      map.current = null;
    };
  }, [basemap]);

  useEffect(() => {
    const m = map.current;
    if (m === null || ready.current === null) return;
    let markers: Marker[] = [];
    let live = true;
    void ready.current.then(() => {
      if (!live) return;
      (m.getSource("out") as GeoJSONSource).setData(lineFeatures(people, "out"));
      (m.getSource("back") as GeoJSONSource).setData(lineFeatures(people, "back"));
      markers = [
        ...others.map((c) => candidateMarker(c, onSelect)),
        ...people.flatMap((p, i) => personMarkers(p, minutesLabel, i * 0.15)),
        ...(meet ? [meetMarker(meet)] : []),
      ];
      markers.forEach((mk) => mk.addTo(m));
      const pts = [...people.flatMap((p) => [p.start, p.home, ...p.out]), ...(meet ? [meet.at] : [])];
      if (pts.length > 0) {
        const bounds = pts.reduce((b, p) => b.extend([...p]), new LngLatBounds([...pts[0]!], [...pts[0]!]));
        m.fitBounds(bounds, { padding, maxZoom: 13, duration: 600 });
      }
    });
    return () => {
      live = false;
      markers.forEach((mk) => mk.remove());
    };
  }, [people, meet, others, minutesLabel, onSelect, padding]);

  return <div ref={box} className="map" role="region" aria-label="Map of the routes" />;
}

export { OPENFREEMAP_DARK };
