/** Compare matrix values with reference journey-planner times (BRIEF.md "real-world spot check"). */
import type { MatrixData } from "../web/core/data";
import { rank } from "../web/core/rank";
import { findStation } from "../web/core/stations";
import { parseClock } from "../web/core/time";

export const SPOT_TOLERANCE_MIN = 5;
const HOME_WINDOW_START = 21 * 60;

export interface SpotRow {
  readonly id: string;
  readonly origin: string;
  readonly destination: string;
  readonly ref: number;
  /** null: the pair is not in the matrix (the meeting end of the pair is not a candidate) */
  readonly ours: number | null;
  readonly delta: number | null;
}

export interface SpotCheckResult {
  readonly rows: readonly SpotRow[];
  readonly within: number;
  readonly compared: number;
}

/** Minimal CSV reader: comma separated, double-quoted fields may contain commas. */
export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const split = (line: string) => [...line.matchAll(/(?:^|,)("(?:[^"]|"")*"|[^,]*)/g)].map((m) =>
    m[1]!.startsWith('"') ? m[1]!.slice(1, -1).replace(/""/g, '"') : m[1]!);
  const header = split(lines[0] ?? "");
  return lines.slice(1).map((l) => {
    const cells = split(l);
    return Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ""]));
  });
}

/**
 * Evening queries (before 21:00) compare outbound minutes origin -> destination, so the destination
 * must be a candidate. Late queries compare home minutes, so the origin must be a candidate.
 */
function matrixMinutes(data: MatrixData, origin: string, destination: string, late: boolean): number | null {
  const meet = findStation(data, late ? origin : destination);
  if (!data.stations[meet]!.candidate) return null;
  const r = rank([{ label: "ref", start: { station: origin }, home: { station: destination } }],
    { lambda: 0, limit: data.nCandidates }, data);
  const person = r.candidates.find((c) => c.station.id === data.stations[meet]!.id)?.people[0];
  if (person === undefined) return null;
  return late ? person.homeMinutes : person.outMinutes;
}

export function spotCheck(data: MatrixData, csvText: string, onlyIds?: readonly string[]): SpotCheckResult {
  const rows = parseCsv(csvText)
    .filter((r) => onlyIds === undefined || onlyIds.includes(r.id ?? ""))
    .map((r): SpotRow => {
      const late = parseClock(r.query_time || "18:30") >= HOME_WINDOW_START;
      const ref = Number(r.ref_minutes);
      const ours = matrixMinutes(data, r.origin ?? "", r.destination ?? "", late);
      return { id: r.id ?? "", origin: r.origin ?? "", destination: r.destination ?? "", ref, ours,
        delta: ours === null ? null : ours - ref };
    });
  const compared = rows.filter((r) => r.delta !== null);
  return { rows, compared: compared.length,
    within: compared.filter((r) => Math.abs(r.delta!) <= SPOT_TOLERANCE_MIN).length };
}
