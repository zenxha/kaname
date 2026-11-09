/** What the map draws. Built from the engine result by usePlan; the map knows nothing of the engine. */
import type { LngLat, MapLeg } from "../model/geometry";

export interface MapPerson {
  /** The person's id in the group, for focus and taps. */
  readonly id: string;
  /** Their number in the list; the marker shows it, so color never identifies a person. */
  readonly number: number;
  readonly label: string;
  /** Minutes there, shown on the marker. */
  readonly minutes: number;
  readonly start: LngLat;
  /** The trip there, ride by ride, in line colors. Empty until the route loads. */
  readonly legs: readonly MapLeg[];
  /** The trip home when it ends somewhere else; empty when home is the start. */
  readonly home: readonly LngLat[];
}

export interface MapStation {
  readonly id: string;
  readonly rank: number;
  readonly at: LngLat;
  readonly name: string;
}

/** A station a meeting end ruled out, shown crossed out. */
export interface MapGone {
  readonly at: LngLat;
  readonly name: string;
}

export interface Padding {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}

export type Theme = "light" | "dark";
