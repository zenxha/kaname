/** What a station field needs beyond the matrix: kana readings, and where the address index lives. */
import { createContext, useContext } from "react";
import type { KanaIndex } from "../model/search";

export interface StationSearch {
  readonly kana: KanaIndex;
  /** Base URL of the data files. */
  readonly base: string;
}

export const StationSearchContext = createContext<StationSearch>({ kana: new Map(), base: "./" });

export const useStationSearch = (): StationSearch => useContext(StationSearchContext);
