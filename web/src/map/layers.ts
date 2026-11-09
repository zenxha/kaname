/** Basemaps and the route layers: rides in line colors on a casing, walks dotted, other homes dashed. */
import type { Feature, FeatureCollection } from "geojson";
import type { ExpressionSpecification, Map as MapLibreMap, StyleSpecification } from "maplibre-gl";
import type { LngLat, MapLeg } from "../model/geometry";
import type { Theme } from "./types";

/** OpenFreeMap: free, no key, OpenStreetMap data. Positron by day, dark at night. */
export const BASEMAPS: Readonly<Record<Theme, string>> = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};

/** The paper the map sits on, the ink of walks, and the grey of homes elsewhere; they match theme.css. */
const PAPER: Readonly<Record<Theme, string>> = { light: "#f2f3f0", dark: "#0f1215" };
const INK: Readonly<Record<Theme, string>> = { light: "#17191c", dark: "#eef0ec" };
const MUTED: Readonly<Record<Theme, string>> = { light: "#7b8088", dark: "#8b949a" };

export function blankStyle(theme: Theme): StyleSpecification {
  return { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": PAPER[theme] } }] };
}

export interface DrawnRoute {
  readonly id: string;
  readonly legs: readonly MapLeg[];
  readonly home: readonly LngLat[];
}

function line(path: readonly LngLat[], props: Readonly<Record<string, string | boolean>>): Feature {
  return { type: "Feature", properties: props, geometry: { type: "LineString", coordinates: path.map(([x, y]) => [x, y]) } };
}

export function routeFeatures(routes: readonly DrawnRoute[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: routes.flatMap((r) => [
      ...r.legs.filter((l) => l.path.length > 1).map((l) => line(l.path, { who: r.id, color: l.color, walk: l.walk, home: false })),
      ...(r.home.length > 1 ? [line(r.home, { who: r.id, color: "", walk: false, home: true })] : []),
    ]),
  };
}

const RIDE: ExpressionSpecification = ["all", ["!", ["get", "home"]], ["!", ["get", "walk"]]];

export function addRouteLayers(map: MapLibreMap, theme: Theme): void {
  map.addSource("routes", { type: "geojson", data: routeFeatures([]) });
  map.addLayer({ id: "route-home", type: "line", source: "routes", filter: ["==", ["get", "home"], true],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": MUTED[theme], "line-width": 2.5, "line-dasharray": [1.5, 2] } });
  map.addLayer({ id: "route-case", type: "line", source: "routes", filter: RIDE,
    layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": PAPER[theme], "line-width": 8 } });
  map.addLayer({ id: "route-line", type: "line", source: "routes", filter: RIDE,
    layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "color"], "line-width": 4 } });
  map.addLayer({ id: "route-walk", type: "line", source: "routes", filter: ["==", ["get", "walk"], true],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": INK[theme], "line-width": 2.5, "line-dasharray": [0.1, 2.2] } });
}

/** One person's lines stay; everyone else's fade. null shows everyone. */
export function setFocus(map: MapLibreMap, focus: string | null): void {
  const pick = (on: number, off: number): number | ExpressionSpecification =>
    focus === null ? on : ["case", ["==", ["get", "who"], focus], on, off];
  map.setPaintProperty("route-line", "line-opacity", pick(1, 0.2));
  map.setPaintProperty("route-case", "line-opacity", pick(1, 0.2));
  map.setPaintProperty("route-walk", "line-opacity", pick(1, 0.2));
  map.setPaintProperty("route-home", "line-opacity", pick(0.9, 0.15));
  map.setPaintProperty("route-line", "line-width", pick(6, 4));
}
