/** What the screen is: phone or desktop layout, its height, and light or dark. */
import { useEffect, useState } from "react";
import type { Theme } from "./map/types";

function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return matches;
}

/** Below this width the result is a sheet over the map; above it, a side panel. */
export const STACKED = "(max-width: 900px)";

export function useStacked(): boolean {
  return useMedia(STACKED);
}

export function useTheme(): Theme {
  return useMedia("(prefers-color-scheme: dark)") ? "dark" : "light";
}

/** The visible height, which changes as a phone's address bar shows and hides. */
export function useViewportHeight(): number {
  const read = () => Math.round(window.visualViewport?.height ?? window.innerHeight);
  const [height, setHeight] = useState(read);
  useEffect(() => {
    const on = () => setHeight(read());
    window.addEventListener("resize", on);
    window.visualViewport?.addEventListener("resize", on);
    return () => {
      window.removeEventListener("resize", on);
      window.visualViewport?.removeEventListener("resize", on);
    };
  }, []);
  return height;
}
