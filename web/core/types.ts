/** Public types of the kaname scoring engine. Everything is read-only: the engine never mutates input. */

/** A place: a station (id, Japanese name or English name) or a coordinate that snaps to stations. */
export type LocationInput =
  | { readonly station: string }
  | { readonly lat: number; readonly lng: number };

export interface ParticipantInput {
  readonly label: string;
  readonly start: LocationInput;
  /** Omitted: the person goes home to their start. */
  readonly home?: LocationInput;
}

export interface RankOptions {
  /** Efficient (1) to fair (0). Default 0.5. */
  readonly alpha?: number;
  /** Minutes added per transfer. Default 5. */
  readonly lambda?: number;
  /** Meeting end, minutes after 00:00 of the service day (24:30 = 1470). Turns on the last-train filter. */
  readonly meetingEnd?: number;
  /** How many ranked candidates to return. Default 10. */
  readonly limit?: number;
  /** Score the outbound leg only (for comparison with outbound-only tools). Default false. */
  readonly ignoreHome?: boolean;
}

export interface StationInfo {
  readonly id: string;
  readonly ja: string;
  readonly en: string;
  readonly lines: number;
}

/** One station a location snapped to, with the walk from the location. */
export interface Snap {
  readonly station: StationInfo;
  readonly distanceM: number;
  readonly walkMinutes: number;
}

export interface ResolvedParticipant {
  readonly label: string;
  readonly start: readonly Snap[];
  readonly home: readonly Snap[];
}

export interface PersonResult {
  readonly label: string;
  readonly startStation: string;
  readonly homeStation: string;
  readonly outMinutes: number;
  readonly homeMinutes: number;
  readonly outTransfers: number;
  readonly homeTransfers: number;
  readonly walkMinutes: number;
  /** c_i(X) = out + home + lambda * transfers + walk */
  readonly cost: number;
  /** Latest departure from the candidate that still reaches home; null when home is the candidate. */
  readonly lastDeparture: number | null;
  /** Whether that departure is at or after the meeting end; null without a meeting end. */
  readonly lastTrainOk: boolean | null;
}

export interface CandidateResult {
  readonly rank: number;
  readonly station: StationInfo;
  /** J(X) = alpha * S / N + (1 - alpha) * M */
  readonly objective: number;
  readonly total: number;
  readonly average: number;
  readonly worst: { readonly label: string; readonly cost: number };
  readonly spread: number;
  readonly people: readonly PersonResult[];
}

export interface Exclusion {
  readonly station: StationInfo;
  readonly reasons: readonly string[];
}

export interface ParetoPoint {
  readonly station: StationInfo;
  readonly average: number;
  readonly worst: number;
}

export interface RankResult {
  readonly candidates: readonly CandidateResult[];
  readonly feasibleCount: number;
  readonly excluded: readonly Exclusion[];
  /** Candidates no other candidate beats on both average and worst case, by average. */
  readonly pareto: readonly ParetoPoint[];
  readonly participants: readonly ResolvedParticipant[];
}
