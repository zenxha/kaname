/**
 * Base map names under our markers fade out. Our badges, names and seal are page elements on top of the
 * map, so the map cannot place its own names around them, and a half-covered "Tokyo" showed beside the 要
 * seal. A faded name still takes its place in the map's layout, so it can show again after a move.
 */
import type { Map as MapLibreMap } from "maplibre-gl";
import type { Rect } from "./labels";

const PROPERTIES = ["text-opacity", "icon-opacity"] as const;
type Property = (typeof PROPERTIES)[number];

/** Each map's own opacity per symbol layer, read before the first change. */
const originals = new WeakMap<MapLibreMap, Map<string, unknown>>();
/** The names faded last time, so an unchanged set does not restyle the map. */
const applied = new WeakMap<MapLibreMap, string>();

/**
 * The opacity of a layer with the named labels hidden. An old-style zoom function cannot go inside an
 * expression, so that layer keeps its own opacity.
 */
export function fadedOpacity(original: unknown, names: readonly string[]): unknown {
  if (names.length === 0) return original;
  const base = original ?? 1;
  if (typeof base !== "number" && !Array.isArray(base)) return original;
  return ["case", ["in", ["get", "name"], ["literal", [...names]]], 0, base];
}

function symbolLayers(map: MapLibreMap): string[] {
  return (map.getStyle()?.layers ?? []).filter((l) => l.type === "symbol").map((l) => l.id);
}

function original(map: MapLibreMap, layer: string, property: Property): unknown {
  const saved = originals.get(map) ?? new Map<string, unknown>();
  originals.set(map, saved);
  const key = `${layer}|${property}`;
  if (!saved.has(key)) saved.set(key, map.getPaintProperty(layer, property));
  return saved.get(key);
}

function namesUnder(map: MapLibreMap, layers: readonly string[], rects: readonly Rect[]): string[] {
  const names = new Set<string>();
  for (const r of rects) {
    for (const f of map.queryRenderedFeatures([[r.left, r.top], [r.right, r.bottom]], { layers: [...layers] })) {
      const name: unknown = f.properties?.name;
      if (typeof name === "string") names.add(name);
    }
  }
  return [...names].sort();
}

/** Fades the base map's names that sit under any of the rectangles, in map pixels, and shows the rest. */
export function fadeLabelsUnder(map: MapLibreMap, rects: readonly Rect[]): void {
  const layers = symbolLayers(map);
  if (layers.length === 0) return;
  const names = namesUnder(map, layers, rects);
  const key = names.join("\n");
  if (applied.get(map) === key) return;
  applied.set(map, key);
  for (const layer of layers) {
    for (const property of PROPERTIES) {
      // Read the layer's own value first, then apply: a later call starts from the same original.
      const value = fadedOpacity(original(map, layer, property), names);
      map.setPaintProperty(layer, property, value as never);
    }
  }
}
