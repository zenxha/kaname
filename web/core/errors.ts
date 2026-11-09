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

/** Every error the engine raises on purpose. `message` is safe to show to a user. */
export class RankError extends Error {
  readonly code: RankErrorCode;

  constructor(code: RankErrorCode, message: string) {
    super(message);
    this.name = "RankError";
    this.code = code;
  }
}
