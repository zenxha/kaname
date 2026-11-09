/** The plan in the address bar: read once on open, kept up to date while editing, and shared on request. */
import { useCallback, useEffect, useRef, useState } from "react";
import type { MatrixData } from "../core/data";
import { t, type Lang } from "./model/i18n";
import { DEFAULT_PEOPLE, type Person } from "./model/scenario";
import { decodePlan, encodePlan, peopleOf, type Plan } from "./model/share";

export interface Opening {
  readonly people: readonly Person[];
  readonly alpha: number;
  readonly selected: string | null;
  /** The people came from a shared link. */
  readonly shared: boolean;
  /** Stations in the link the data does not have. */
  readonly unknown: number;
}

const DEFAULT_ALPHA = 0.5;

/** What the app opens on: the plan in the link, or the example group. */
export function readOpening(data: MatrixData, search: string): Opening {
  const { plan, unknown } = decodePlan(search, (id) => data.byId.has(id));
  if (plan === null) return { people: DEFAULT_PEOPLE, alpha: DEFAULT_ALPHA, selected: null, shared: false, unknown };
  return { people: peopleOf(plan), alpha: plan.alpha, selected: plan.at, shared: true, unknown };
}

const EMPTY: Plan = { people: [], alpha: DEFAULT_ALPHA, at: null };

/** Keeps the address bar on the current plan, without adding history entries. The untouched example has a clean address. */
export function useLinkSync(plan: Plan, untouched: boolean): void {
  useEffect(() => {
    const { pathname, search, hash } = window.location;
    const next = encodePlan(untouched ? EMPTY : plan, new URLSearchParams(search));
    if (next !== search) window.history.replaceState(window.history.state, "", `${pathname}${next}${hash}`);
  }, [plan, untouched]);
}

/** How long the "Link copied" note stays. */
const TOAST_MS = 2500;

/** Shares the current address: the phone's share sheet on a touch screen, else a copy to the clipboard. */
export function useShare(lang: Lang, station: string | null): { readonly share: () => void; readonly toast: string | null } {
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef(0);
  const show = useCallback((text: string) => {
    window.clearTimeout(timer.current);
    setToast(text);
    timer.current = window.setTimeout(() => setToast(null), TOAST_MS);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const share = useCallback(() => {
    const url = window.location.href;
    const text = station === null ? undefined : t(lang, "shareText", { station });
    const sheet = window.matchMedia("(pointer: coarse)").matches && typeof navigator.share === "function";
    const go = sheet
      ? navigator.share(text === undefined ? { title: "Kaname 要", url } : { title: "Kaname 要", text, url })
      : navigator.clipboard.writeText(url).then(() => show(t(lang, "copied")));
    go.catch((e: unknown) => {
      if (e instanceof DOMException && e.name === "AbortError") return; // the share sheet was closed
      show(t(lang, "copyFailed", { url }));
    });
  }, [lang, station, show]);
  return { share, toast };
}
