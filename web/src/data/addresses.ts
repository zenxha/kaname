/** The address index loads once, on the first Japanese typed into a station field (about 230 KB compressed). */
import { useEffect, useState } from "react";
import { RankError } from "../../core/errors";
import { parseAddresses, type AddressIndex } from "../model/address";

let pending: Promise<AddressIndex> | null = null;

export function loadAddresses(base: string): Promise<AddressIndex> {
  if (pending === null) {
    const load = fetch(`${base}addresses.json`)
      .then((r) => {
        if (!r.ok) throw new RankError("BAD_DATA", `addresses.json: HTTP ${r.status}`);
        return r.json() as Promise<unknown>;
      })
      .then(parseAddresses);
    pending = load;
    load.catch(() => {
      if (pending === load) pending = null; // a failed load is tried again next time
    });
  }
  return pending;
}

export type AddressState =
  | { readonly status: "idle" | "loading" }
  | { readonly status: "ready"; readonly index: AddressIndex }
  | { readonly status: "error" };

/**
 * Starts loading when `wanted` first turns true; the index is shared by every field. The effect re-runs
 * only when `wanted` or the result changes, so a load in flight is never dropped by its own state change.
 */
export function useAddresses(base: string, wanted: boolean): AddressState {
  const [index, setIndex] = useState<AddressIndex | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!wanted || index !== null) return;
    let live = true;
    setFailed(false);
    loadAddresses(base)
      .then((i) => live && setIndex(i))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [base, wanted, index]);
  if (index !== null) return { status: "ready", index };
  if (failed) return { status: "error" };
  return { status: wanted ? "loading" : "idle" };
}
