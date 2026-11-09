import { useEffect, useRef, useState } from "react";
import { fetchRouteBlock, loadAppData, type AppData } from "./load";

export type Loaded = { readonly status: "loading" } | { readonly status: "error"; readonly message: string } | { readonly status: "ready"; readonly data: AppData };

export function useAppData(base: string): Loaded {
  const [state, setState] = useState<Loaded>({ status: "loading" });
  useEffect(() => {
    let live = true;
    loadAppData(base)
      .then((data) => live && setState({ status: "ready", data }))
      .catch((e: unknown) => live && setState({ status: "error", message: e instanceof Error ? e.message : String(e) }));
    return () => {
      live = false;
    };
  }, [base]);
  return state;
}

export interface Blocks {
  readonly candidate: number;
  readonly out: Uint16Array;
  readonly home: Uint16Array;
}

/** Route blocks of the selected candidate, cached per candidate. */
export function useRouteBlocks(data: AppData | null, candidate: number | null): Blocks | null {
  const cache = useRef(new Map<number, Promise<Blocks>>());
  const [blocks, setBlocks] = useState<Blocks | null>(null);
  useEffect(() => {
    if (data === null || candidate === null) return;
    let live = true;
    const cached = cache.current.get(candidate)
      ?? Promise.all([fetchRouteBlock(data, "out", candidate), fetchRouteBlock(data, "home", candidate)])
        .then(([out, home]) => ({ candidate, out, home }));
    cache.current.set(candidate, cached);
    cached.then((b) => live && setBlocks(b)).catch(() => {
      cache.current.delete(candidate);
      if (live) setBlocks(null);
    });
    return () => {
      live = false;
    };
  }, [data, candidate]);
  return blocks !== null && blocks.candidate === candidate ? blocks : null;
}
