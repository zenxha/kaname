/** Full-bleed MapLibre map: routes, start and home markers, time chips, meeting and candidate markers. */
import type { FeatureCollection } from "geojson";
import { LngLatBounds, Map as MapLibreMap, Marker, type GeoJSONSource, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState, type RefObject } from "react";
import type { LngLat } from "../model/geometry";
import "./maplibreWorker";

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

export interface Padding {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}

interface Props {
  readonly basemap: string | null;
  readonly label: string;
  readonly people: readonly MapPerson[];
  readonly meet: MapCandidate | null;
  readonly others: readonly MapCandidate[];
  readonly minutesLabel: (n: number) => string;
  readonly onSelect: (id: string) => void;
  /** The map refits only when this changes (the people or the shown station). */
  readonly fitKey: string;
  /** Space the floating cards cover, so fitBounds keeps the routes visible. */
  readonly padding: Padding;
}

export const OPENFREEMAP_DARK = "https://tiles.openfreemap.org/styles/dark";
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

/** Every marker carries the person's number, so color is never the only identifier. */
function personMarkers(p: MapPerson, minutesLabel: (n: number) => string): Marker[] {
  const n = String(p.number);
  const markers = [new Marker({ element: el("mk-start pop", n, { background: p.color }) }).setLngLat([...p.start])];
  if (p.homeMinutes > 0) {
    markers.push(new Marker({ element: el("mk-home pop", n, { borderColor: p.color }) }).setLngLat([...p.home]));
  }
  const outMid = midpoint(p.out);
  if (outMid && p.outMinutes > 0) {
    const chip = el("mk-chip pop", `${n} · ${minutesLabel(p.outMinutes)}`, { borderColor: p.color });
    markers.push(new Marker({ element: chip }).setLngLat([...outMid]));
  }
  const backMid = midpoint(p.back);
  if (backMid && p.homeMinutes > 0) {
    const chip = el("mk-chip home pop", `${n} · ${minutesLabel(p.homeMinutes)}`, { borderColor: p.color });
    markers.push(new Marker({ element: chip }).setLngLat([...backMid]));
  }
  return markers;
}

function meetMarker(meet: MapCandidate): Marker {
  const node = el("mk-meet");
  node.append(el("ring"), el("core", "要"), el("name", meet.name));
  return new Marker({ element: node }).setLngLat([...meet.at]);
}

/** A 44 px button around a small numbered dot. */
function candidateMarker(c: MapCandidate, onSelect: (id: string) => void): Marker {
  const node = document.createElement("button");
  node.type = "button";
  node.className = "mk-cand";
  node.setAttribute("aria-label", `${c.rank} ${c.name}`);
  node.append(el("mk-cand-dot", String(c.rank)));
  node.addEventListener("click", () => onSelect(c.id));
  return new Marker({ element: node }).setLngLat([...c.at]);
}

/** Creates the map; falls back to a plain background if the basemap style cannot load. */
function useMap(box: RefObject<HTMLDivElement | null>, basemap: string | null): MapLibreMap | null {
  const [failed, setFailed] = useState(false);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const style = failed || basemap === null ? BLANK : basemap;
  useEffect(() => {
    if (box.current === null) return;
    const m = new MapLibreMap({ container: box.current, style, center: [...TOKYO], zoom: 9.5,
      attributionControl: { compact: true }, dragRotate: false });
    m.touchZoomRotate.disableRotation();
    m.on("load", () => {
      addRouteLayers(m);
      setMap(m);
    });
    m.on("error", () => {
      if (!m.isStyleLoaded() && style !== BLANK) setFailed(true);
    });
    return () => {
      setMap(null);
      m.remove();
    };
  }, [box, style]);
  return map;
}

export function MapView(props: Props) {
  const { basemap, label, people, meet, others, minutesLabel, onSelect, fitKey, padding } = props;
  const box = useRef<HTMLDivElement>(null);
  const map = useMap(box, basemap);
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });

  useEffect(() => {
    if (map === null) return;
    (map.getSource("out") as GeoJSONSource).setData(lineFeatures(people, "out"));
    (map.getSource("back") as GeoJSONSource).setData(lineFeatures(people, "back"));
    const markers = [
      ...others.map((c) => candidateMarker(c, onSelect)),
      ...people.flatMap((p) => personMarkers(p, minutesLabel)),
      ...(meet ? [meetMarker(meet)] : []),
    ];
    markers.forEach((mk) => mk.addTo(map));
    return () => markers.forEach((mk) => mk.remove());
  }, [map, people, meet, others, minutesLabel, onSelect]);

  useEffect(() => {
    if (map === null) return;
    const { people: ps, meet: mt } = latest.current;
    const pts = [...ps.flatMap((p) => [p.start, p.home]), ...(mt ? [mt.at] : [])];
    if (pts.length === 0) return;
    const bounds = pts.reduce((b, p) => b.extend([...p]), new LngLatBounds([...pts[0]!], [...pts[0]!]));
    map.fitBounds(bounds, { padding, maxZoom: 13, duration: 600 });
  }, [map, fitKey, padding]);

  return <div ref={box} className="map" role="region" aria-label={label} />;
}
