/** Runs "lines arrive" and "seal stamps" once per new answer; otherwise the routes show in full. */
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import { useEffect, type RefObject } from "react";
import { DRAW_STAGGER_MS, drawDuration, easeOut, partialLegs } from "../model/drawIn";
import { routeFeatures } from "./layers";
import type { MapPerson } from "./types";

export function stamp(seal: HTMLElement | null, animate: boolean): void {
  if (seal === null || !seal.classList.contains("wait")) return;
  seal.classList.remove("wait");
  if (animate) seal.classList.add("stamp");
}

/**
 * `drawKey` names the answer on show. `drawn` remembers the last key drawn, so a redraw for any other
 * reason (a new theme, a language switch) shows the routes at once.
 */
export function useDrawIn(map: MapLibreMap | null, people: readonly MapPerson[], drawKey: string,
  drawn: RefObject<string>, seal: RefObject<HTMLElement | null>, reduced: boolean): void {
  useEffect(() => {
    if (map === null) return;
    const source = map.getSource("routes") as GeoJSONSource | undefined;
    if (source === undefined) return;
    const routes = people.map((p) => ({ id: p.id, legs: p.legs, home: p.home }));
    // Routes have loaded, or nobody has to ride (everyone is already at the station).
    const ready = people.some((p) => p.legs.length > 0) || people.every((p) => p.minutes === 0);
    if (drawn.current === drawKey || reduced) {
      source.setData(routeFeatures(routes));
      if (ready || people.length === 0) {
        drawn.current = drawKey;
        stamp(seal.current, false);
      }
      return;
    }
    if (!ready) {
      source.setData(routeFeatures([]));
      return;
    }
    const t0 = performance.now();
    const timing = people.map((p, i) => ({ delay: i * DRAW_STAGGER_MS, duration: drawDuration(p.minutes) }));
    const end = Math.max(...timing.map((t) => t.delay + t.duration));
    let frame = 0;
    const step = (now: number) => {
      const partial = routes.map((r, i) => {
        const { delay, duration } = timing[i]!;
        return { ...r, legs: partialLegs(r.legs, easeOut(Math.min(1, Math.max(0, (now - t0 - delay) / duration)))), home: [] };
      });
      if (now - t0 >= end) {
        source.setData(routeFeatures(routes));
        drawn.current = drawKey;
        stamp(seal.current, true);
        return;
      }
      source.setData(routeFeatures(partial));
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [map, people, drawKey, drawn, seal, reduced]);
}
