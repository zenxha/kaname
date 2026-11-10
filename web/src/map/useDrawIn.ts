/** Runs "lines arrive" and "seal stamps" once per new answer; otherwise the routes show in full. */
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useRef, type RefObject } from "react";
import { DRAW_STAGGER_MS, drawDuration, easeOut, partialLegs } from "../model/drawIn";
import { BUZZ_MS, IMPACT_MS, shouldBuzz, STAMP_MS } from "../model/stamp";
import { routeFeatures } from "./layers";
import type { MapPerson } from "./types";

/** Shows the waiting seal: stamped (src/model/stamp.ts), or at once when `animate` is false. */
export function stamp(seal: HTMLElement | null, animate: boolean): void {
  if (seal === null || !seal.classList.contains("wait")) return;
  seal.classList.remove("wait");
  if (!animate) return;
  seal.parentElement?.style.setProperty("--stamp-ms", `${STAMP_MS}ms`);
  seal.parentElement?.style.setProperty("--impact-ms", `${IMPACT_MS}ms`);
  seal.classList.add("stamp");
  const active = navigator.userActivation?.hasBeenActive ?? false;
  if (shouldBuzz({ animate, active, canVibrate: typeof navigator.vibrate === "function" })) {
    window.setTimeout(() => navigator.vibrate(BUZZ_MS), IMPACT_MS);
  }
}

/** About 30 source updates a second: each one sends the routes to MapLibre's worker. */
const FRAME_MS = 32;

/**
 * `drawKey` names the answer on show. `drawn` remembers the last key drawn, so a redraw for any other
 * reason (a new theme, a language switch) shows the routes at once. A re-run during the animation
 * (a new theme, an edited name) continues from the same start, and a removed map stops it at once.
 */
export function useDrawIn(map: MapLibreMap | null, people: readonly MapPerson[], drawKey: string,
  drawn: RefObject<string>, seal: RefObject<HTMLElement | null>, reduced: boolean, onStamp: () => void): void {
  const started = useRef<{ key: string; t0: number } | null>(null);
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
    if (started.current?.key !== drawKey) started.current = { key: drawKey, t0: performance.now() };
    const t0 = started.current.t0;
    const timing = people.map((p, i) => ({ delay: i * DRAW_STAGGER_MS, duration: drawDuration(p.minutes) }));
    const end = Math.max(...timing.map((t) => t.delay + t.duration));
    let frame = 0;
    let live = true;
    let last = -Infinity;
    const stop = () => {
      live = false;
      cancelAnimationFrame(frame);
    };
    map.once("remove", stop);
    const step = (now: number) => {
      if (!live) return;
      const partial = routes.map((r, i) => {
        const { delay, duration } = timing[i]!;
        return { ...r, legs: partialLegs(r.legs, easeOut(Math.min(1, Math.max(0, (now - t0 - delay) / duration)))), home: [] };
      });
      if (now - t0 >= end) {
        source.setData(routeFeatures(routes));
        drawn.current = drawKey;
        stamp(seal.current, true);
        onStamp();
        return;
      }
      if (now - last >= FRAME_MS) {
        source.setData(routeFeatures(partial));
        last = now;
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => {
      map.off("remove", stop);
      stop();
    };
  }, [map, people, drawKey, drawn, seal, reduced, onStamp]);
}
