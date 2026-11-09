/** Validate untrusted participant input and resolve each place to station options. */
import { isRecord, type MatrixData } from "./data";
import { RankError } from "./errors";
import { describeStation, findStation, snapToStations, stationInfo, type StationOption } from "./stations";
import type { LocationInput, ParticipantInput, ResolvedParticipant, Snap } from "./types";

export const MAX_PARTICIPANTS = 50;
export const MAX_LABEL_LENGTH = 80;

export interface Resolved {
  readonly label: string;
  readonly start: readonly StationOption[];
  readonly home: readonly StationOption[];
}

type Place = "start" | "home";

function withLabel(label: string, place: Place, fn: () => StationOption[]): StationOption[] {
  try {
    return fn();
  } catch (e) {
    if (e instanceof RankError) throw new RankError(e.code, `participant "${label}": ${e.message}`, { participant: label, place });
    throw e;
  }
}

function resolveLocation(data: MatrixData, loc: unknown, label: string, place: Place): StationOption[] {
  if (isRecord(loc) && typeof loc.station === "string") {
    const query = loc.station;
    return withLabel(label, place, () => [{ index: findStation(data, query), distanceM: 0, walkMinutes: 0 }]);
  }
  if (isRecord(loc) && typeof loc.lat === "number" && typeof loc.lng === "number") {
    const { lat, lng } = loc;
    return withLabel(label, place, () => snapToStations(data, lat, lng));
  }
  throw new RankError("BAD_PARTICIPANT", `participant "${label}": ${place} must be {station} or {lat, lng}`, { participant: label, place });
}

function validLabel(p: unknown, i: number): string {
  const label = isRecord(p) && typeof p.label === "string" ? p.label.trim() : "";
  if (label.length === 0 || label.length > MAX_LABEL_LENGTH) {
    throw new RankError("BAD_PARTICIPANT", `participant ${i + 1} needs a label of 1 to ${MAX_LABEL_LENGTH} characters`);
  }
  return label;
}

function checkRoutable(data: MatrixData, r: Resolved, needHome: boolean): void {
  const k = data.nCandidates;
  const n = data.nStations;
  const reachesOut = r.start.some((o) => data.outMin.subarray(o.index * k, o.index * k + k).some((v) => v !== 0xffff));
  const reachesHome = r.home.some((o) => {
    for (let c = 0; c < k; c++) if (data.homeMin[c * n + o.index] !== 0xffff) return true;
    return false;
  });
  const names = (opts: readonly StationOption[]) => opts.map((o) => describeStation(data.stations[o.index]!)).join(", ");
  if (!reachesOut) {
    throw new RankError("UNROUTABLE_STATION", `participant "${r.label}": ${names(r.start)} cannot reach any meeting station`, { participant: r.label, place: "start" });
  }
  if (needHome && !reachesHome) {
    throw new RankError("UNROUTABLE_STATION", `participant "${r.label}": no meeting station has a train home to ${names(r.home)}`, { participant: r.label, place: "home" });
  }
}

/** Validate and resolve the group. Throws RankError naming the participant and the station. */
export function resolveParticipants(data: MatrixData, input: readonly ParticipantInput[], needHome: boolean): Resolved[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new RankError("NO_PARTICIPANTS", "add at least one participant");
  }
  if (input.length > MAX_PARTICIPANTS) {
    throw new RankError("TOO_MANY_PARTICIPANTS", `at most ${MAX_PARTICIPANTS} participants, got ${input.length}`);
  }
  const labels = input.map((p: unknown, i) => validLabel(p, i));
  const dup = labels.find((l, i) => labels.indexOf(l) !== i);
  if (dup !== undefined) throw new RankError("BAD_PARTICIPANT", `two participants are called "${dup}"; labels must differ`);
  return input.map((p: unknown, i) => {
    const label = labels[i]!;
    const raw = p as { start?: LocationInput; home?: LocationInput };
    const start = resolveLocation(data, raw.start, label, "start");
    const home = raw.home === undefined ? start : resolveLocation(data, raw.home, label, "home");
    const r = { label, start, home };
    checkRoutable(data, r, needHome);
    return r;
  });
}

export function publicParticipant(data: MatrixData, r: Resolved): ResolvedParticipant {
  const snap = (o: StationOption): Snap => ({
    station: stationInfo(data.stations[o.index]!),
    distanceM: o.distanceM,
    walkMinutes: o.walkMinutes,
  });
  return { label: r.label, start: r.start.map(snap), home: r.home.map(snap) };
}
