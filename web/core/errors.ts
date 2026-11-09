export type RankErrorCode =
  | "BAD_DATA"
  | "BAD_OPTION"
  | "BAD_PARTICIPANT"
  | "NO_PARTICIPANTS"
  | "TOO_MANY_PARTICIPANTS"
  | "UNKNOWN_STATION"
  | "AMBIGUOUS_STATION"
  | "UNROUTABLE_STATION"
  | "LOCATION_TOO_FAR";

/** Who the error is about, so a UI can say it in its own words. */
export interface RankErrorContext {
  /** The participant's label. */
  readonly participant?: string;
  /** The place of that participant that failed. */
  readonly place?: "start" | "home";
}

/** Every error the engine raises on purpose. `message` is safe to show to a user. */
export class RankError extends Error {
  readonly code: RankErrorCode;
  readonly participant: string | undefined;
  readonly place: "start" | "home" | undefined;

  constructor(code: RankErrorCode, message: string, context: RankErrorContext = {}) {
    super(message);
    this.name = "RankError";
    this.code = code;
    this.participant = context.participant;
    this.place = context.place;
  }
}
