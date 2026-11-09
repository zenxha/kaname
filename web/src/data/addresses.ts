/** The address index loads once, on the first Japanese typed into a station field (about 230 KB compressed). */
import { useEffect, useState } from "react";
import { RankError } from "../../core/errors";
import { parseAddresses, type AddressIndex } from "../model/address";

const pending = new Map<string, Promise<AddressIndex>>();

/** One load per data address; a failed load is tried again next time. */
export function loadAddresses(base: string): Promise<AddressIndex> {
  const cached = pending.get(base);
  if (cached !== undefined) return cached;
  const load = fetch(`${base}addresses.json`)
    .then((r) => {
      if (!r.ok) throw new RankError("BAD_DATA", `addresses.json: HTTP ${r.status}`);
      return r.json() as Promise<unknown>;
    })
    .then(parseAddresses);
  pending.set(base, load);
  load.catch(() => {
    if (pending.get(base) === load) pending.delete(base);
  });
  return load;
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
      .then((i) => {
        if (live) setIndex(i);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [base, wanted, index]);
  if (index !== null) return { status: "ready", index };
  if (failed) return { status: "error" };
  return { status: wanted ? "loading" : "idle" };
}
